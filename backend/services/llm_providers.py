"""LLM calls for text-to-SQL: OpenAI primary, then a chain of genuinely
reliable free-standing-tier providers — Groq, Mistral, OpenRouter,
Cerebras. Free model catalogs on these providers change often (confirmed
in practice — the first version of this chain hit real 404s within the
same session it was written), so:
  - OpenRouter uses "openrouter/free", a router meta-model that always
    auto-selects from whatever's currently free, rather than pinning one
    specific model ID that can vanish overnight.
  - Mistral and Cerebras are called via direct REST requests, not their
    SDKs — sidesteps SDK-version/import churn entirely (hit a real,
    unexplained import error from the mistralai SDK despite matching
    their own current docs exactly).

Each provider needs its own free API key — sign up (no card required for
any of these) and add to your .env:
  GROQ_API_KEY        — https://console.groq.com
  MISTRAL_API_KEY      — https://console.mistral.ai
  OPENROUTER_API_KEY   — https://openrouter.ai
  CEREBRAS_API_KEY     — https://cloud.cerebras.ai

Any provider without a key configured is silently skipped in the chain —
you don't need all 5, just at least one for the feature to work.
"""
import os

import requests
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY")


def _chat_messages(system_prompt, user_prompt):
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def call_openai(system_prompt, user_prompt):
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=_chat_messages(system_prompt, user_prompt),
        temperature=0,
    )
    return response.choices[0].message.content.strip()


def call_groq(system_prompt, user_prompt):
    # Groq is OpenAI-API-compatible — same client, different base_url.
    # llama-3.3-70b-versatile was retired; gpt-oss-120b is Groq's current
    # flagship free model as of August 2026.
    from openai import OpenAI

    client = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=_chat_messages(system_prompt, user_prompt),
        temperature=0,
    )
    return response.choices[0].message.content.strip()


def call_mistral(system_prompt, user_prompt):
    # Direct REST call, not the SDK — sidesteps SDK import issues entirely
    resp = requests.post(
        "https://api.mistral.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {MISTRAL_API_KEY}"},
        json={
            "model": "mistral-small-latest",
            "messages": _chat_messages(system_prompt, user_prompt),
            "temperature": 0,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def call_openrouter(system_prompt, user_prompt):
    # openrouter/free auto-selects whatever's currently free — avoids
    # pinning a specific model ID that can be pulled from the free tier
    # without notice (this happened in practice, mid-session)
    from openai import OpenAI

    client = OpenAI(api_key=OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
    response = client.chat.completions.create(
        model="openrouter/free",
        messages=_chat_messages(system_prompt, user_prompt),
        temperature=0,
    )
    return response.choices[0].message.content.strip()


def call_cerebras(system_prompt, user_prompt):
    # Direct REST call, not the SDK — same reasoning as Mistral above
    resp = requests.post(
        "https://api.cerebras.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {CEREBRAS_API_KEY}"},
        json={
            "model": "gpt-oss-120b",
            "messages": _chat_messages(system_prompt, user_prompt),
            "temperature": 0,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


PROVIDERS = [
    ("openai", OPENAI_API_KEY, call_openai),
    ("groq", GROQ_API_KEY, call_groq),
    ("mistral", MISTRAL_API_KEY, call_mistral),
    ("openrouter", OPENROUTER_API_KEY, call_openrouter),
    ("cerebras", CEREBRAS_API_KEY, call_cerebras),
]


def call_llm_with_fallback(system_prompt, user_prompt):
    """Returns (response_text, provider_used). Tries each configured
    provider in order; a provider with no API key set is skipped entirely
    rather than attempted and failed.
    """
    errors = []
    any_configured = False

    for name, key, fn in PROVIDERS:
        if not key:
            continue
        any_configured = True
        try:
            return fn(system_prompt, user_prompt), name
        except Exception as e:
            errors.append(f"{name}: {e}")
            print(f"{name} call failed ({e}), trying next provider...")

    if not any_configured:
        raise RuntimeError(
            "No LLM API key configured — set at least one of OPENAI_API_KEY, "
            "GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY in .env"
        )

    raise RuntimeError(f"All configured LLM providers failed. {'; '.join(errors)}")