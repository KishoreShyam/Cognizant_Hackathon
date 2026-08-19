"""
urls.py for the agent module.
"""
from django.urls import path
from .views import PatientAIContextView, AgentChatView, AgentQuickActionView

urlpatterns = [
    path('patients/<str:patient_id>/ai-context/', PatientAIContextView.as_view(), name='patient-ai-context'),
    path('agent/chat/', AgentChatView.as_view(), name='agent-chat'),
    path('agent/quick-action/', AgentQuickActionView.as_view(), name='agent-quick-action'),
]
