"""
agent.py

Patient Risk Understanding Agent using pure LangChain LCEL.

Architecture:
  ChatOpenAI (with bound tools)
  → Tool-calling loop (manual, no LangGraph, no AgentExecutor)
  → Final natural-language response

The agent NEVER recalculates risk or SHAP values.
It reads only from ML outputs already stored in the database.
OpenAI API key is read from server environment — never sent to the frontend.
"""

import os
import json
import logging
from typing import Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import (
    HumanMessage,
    SystemMessage,
    AIMessage,
    ToolMessage,
)

from .prompts import SYSTEM_PROMPT
from .tools import ALL_TOOLS

logger = logging.getLogger(__name__)

# Map tool name → callable for the execution loop
TOOL_MAP = {t.name: t for t in ALL_TOOLS}


def get_llm() -> ChatOpenAI:
    """
    Instantiate the OpenAI LLM.
    Key is read server-side only — never exposed to the frontend.
    Re-reads .env on every call so the server picks up the key without a restart.
    """
    from pathlib import Path
    from dotenv import load_dotenv

    # Force-reload .env so we pick up the key even if the server was already running
    env_path = Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(env_path, override=True)

    api_key = os.environ.get('OPENAI_API_KEY', '').strip()
    if not api_key:
        raise ValueError(
            'OPENAI_API_KEY is not configured. '
            'Add it to backend/.env: OPENAI_API_KEY=sk-proj-your-key-here'
        )
    return ChatOpenAI(
        model='gpt-4o-mini',
        temperature=0.2,
        max_tokens=1500,
        api_key=api_key,
        timeout=30,
    )


def run_agent(patient_id: str, message: str, chat_history: Optional[list] = None) -> dict:
    """
    Run the agent for a given patient and user message using a
    manual LangChain LCEL tool-calling loop (no LangGraph, no AgentExecutor).

    Flow:
      1. Build message list: SystemMessage + optional history + HumanMessage
      2. Call LLM (with tools bound)
      3. If LLM requests tool calls → execute tools → append ToolMessages
      4. Call LLM again with results (up to 5 iterations)
      5. Return the final text response

    Args:
        patient_id : The patient to focus on (e.g. 'TEST-CA-0001')
        message    : The user's question / request
        chat_history: Optional list of previous {role, content} dicts

    Returns:
        {
            'response'  : str,
            'patient_id': str,
            'sources'   : list[str],
            'error'     : str | None
        }
    """
    try:
        llm = get_llm()
        llm_with_tools = llm.bind_tools(ALL_TOOLS)

        # ── Pre-load patient context and embed in system message ──
        # This lets the agent answer questions without always calling tools,
        # and avoids dumping data on greetings/casual messages.
        from .context_builder import build_patient_context
        ctx = build_patient_context(patient_id)
        patient_context_block = ctx.get('context_text', '') if 'error' not in ctx else ''

        system_content = SYSTEM_PROMPT
        if patient_context_block:
            system_content += f"\n\n--- PATIENT CONTEXT (available for reference, use only when relevant) ---\n{patient_context_block}\n--- END PATIENT CONTEXT ---"

        # ── Build initial message list ──
        messages = [SystemMessage(content=system_content)]

        # Append prior chat history (role/content pairs from the frontend)
        for h in (chat_history or []):
            role = h.get('role', 'user')
            content = h.get('content', '')
            if role == 'assistant':
                messages.append(AIMessage(content=content))
            else:
                messages.append(HumanMessage(content=content))

        messages.append(HumanMessage(content=message))

        # ── Tool-calling loop (max 5 iterations) ──
        MAX_ITERATIONS = 5
        for _ in range(MAX_ITERATIONS):
            response: AIMessage = llm_with_tools.invoke(messages)
            messages.append(response)

            # If no tool calls → we have the final answer
            if not getattr(response, 'tool_calls', None):
                break

            # Execute each requested tool call
            for tc in response.tool_calls:
                tool_name = tc['name']
                tool_args = tc['args']
                tool_id   = tc['id']

                tool_fn = TOOL_MAP.get(tool_name)
                if tool_fn is None:
                    tool_result = f"Error: tool '{tool_name}' not found."
                else:
                    try:
                        tool_result = tool_fn.invoke(tool_args)
                    except Exception as tool_err:
                        tool_result = f"Tool execution error: {str(tool_err)}"

                messages.append(
                    ToolMessage(
                        content=str(tool_result),
                        tool_call_id=tool_id,
                        name=tool_name,
                    )
                )

        # ── Extract final text response ──
        final = messages[-1]
        if isinstance(final, AIMessage):
            response_text = final.content or 'I was unable to generate a response. Please try again.'
        else:
            response_text = 'I was unable to generate a response. Please try again.'

        return {
            'patient_id': patient_id,
            'response': response_text,
            'sources': [
                'ML Risk Prediction (CatBoost)',
                'TreeSHAP Attribution',
                'Patient SDOH Data',
            ],
            'error': None,
        }

    except ValueError as ve:
        logger.error(f"Agent config error: {ve}")
        return {
            'patient_id': patient_id,
            'response': None,
            'sources': [],
            'error': str(ve),
        }
    except Exception as e:
        logger.error(f"Agent execution error for {patient_id}: {e}", exc_info=True)
        return {
            'patient_id': patient_id,
            'response': None,
            'sources': [],
            'error': (
                'The AI assistant is temporarily unavailable. '
                'The existing ML risk information remains available in the patient analysis. '
                f'Technical detail: {str(e)}'
            ),
        }
