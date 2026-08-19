"""
views.py for the agent module.

Endpoints:
  GET  /api/patients/<patient_id>/ai-context/   — returns structured context for the frontend header
  POST /api/agent/chat/                          — runs the agent and returns a response
  POST /api/agent/quick-action/                  — sends a predefined quick-action prompt
"""

import json
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.views.decorators.csrf import csrf_exempt

from .context_builder import build_patient_context
from .agent import run_agent
from .prompts import QUICK_ACTION_PROMPTS

logger = logging.getLogger(__name__)


class PatientAIContextView(APIView):
    """
    GET /api/patients/<patient_id>/ai-context/

    Returns a lightweight patient context summary for the chatbot header.
    Does NOT run the LLM — just reads from the database via context_builder.
    """
    def get(self, request, patient_id):
        try:
            ctx = build_patient_context(patient_id)
            if 'error' in ctx:
                return Response({'error': ctx['error']}, status=status.HTTP_404_NOT_FOUND)

            # Return only what the frontend needs for the header + quick display
            return Response({
                'patient_id': ctx['patient_id'],
                'name': ctx['name'],
                'gender': ctx['gender'],
                'county': ctx['county'],
                'state': ctx['state'],
                'tract_fips': ctx['tract_fips'],
                'risk_5_level': ctx['risk_5_level'],
                'risk_5_confidence_pct': ctx['risk_5_confidence_pct'],
                'risk_3_level': ctx['risk_3_level'],
                'risk_3_confidence_pct': ctx['risk_3_confidence_pct'],
                'intervention_priority': ctx['intervention_priority'],
                'driver_type': ctx['driver_type'],
                'primary_driver': ctx['primary_driver'],
                'sdoh_data': ctx['sdoh_data'],
                'clinical_data': ctx['clinical_data'],
                'sdoh_drivers': ctx['sdoh_drivers'][:5],
                'clinical_drivers': ctx['clinical_drivers'][:5],
                'intervention_options': ctx['intervention_options'][:6],
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"PatientAIContextView error for {patient_id}: {e}")
            return Response(
                {'error': f'Failed to load patient context: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class AgentChatView(APIView):
    """
    POST /api/agent/chat/

    Request body:
    {
        "patient_id": "TEST-CA-0001",
        "message": "Why is this member considered moderate risk?",
        "chat_history": []   // optional list of {role, content} dicts
    }

    Response:
    {
        "patient_id": "TEST-CA-0001",
        "response": "...",
        "sources": ["ML Risk Prediction", ...],
        "error": null
    }
    """
    def post(self, request):
        patient_id = request.data.get('patient_id', '').strip()
        message = request.data.get('message', '').strip()
        chat_history = request.data.get('chat_history', [])

        if not patient_id:
            return Response(
                {'error': 'patient_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not message:
            return Response(
                {'error': 'message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify patient exists before calling the agent
        try:
            from sdoh.models import Patient
            Patient.objects.get(patient_id=patient_id)
        except Patient.DoesNotExist:
            return Response(
                {'error': f'Patient {patient_id} not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = run_agent(patient_id=patient_id, message=message, chat_history=chat_history)

        if result.get('error') and not result.get('response'):
            return Response(result, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(result, status=status.HTTP_200_OK)


class AgentQuickActionView(APIView):
    """
    POST /api/agent/quick-action/

    Request body:
    {
        "patient_id": "TEST-CA-0001",
        "action": "explain_risk"   // one of the QUICK_ACTION_PROMPTS keys
    }
    """
    def post(self, request):
        patient_id = request.data.get('patient_id', '').strip()
        action = request.data.get('action', '').strip()

        if not patient_id or not action:
            return Response(
                {'error': 'patient_id and action are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        prompt = QUICK_ACTION_PROMPTS.get(action)
        if not prompt:
            valid = list(QUICK_ACTION_PROMPTS.keys())
            return Response(
                {'error': f'Unknown action "{action}". Valid actions: {valid}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify patient exists
        try:
            from sdoh.models import Patient
            Patient.objects.get(patient_id=patient_id)
        except Patient.DoesNotExist:
            return Response(
                {'error': f'Patient {patient_id} not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = run_agent(patient_id=patient_id, message=prompt)

        if result.get('error') and not result.get('response'):
            return Response(result, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({**result, 'action': action}, status=status.HTTP_200_OK)
