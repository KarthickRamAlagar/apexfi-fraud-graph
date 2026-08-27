"""LLM calls for text-to-SQL: OpenAI primary, Gemini fallback, Hugging Face
as a third-tier fallback — so the feature keeps working even if two of the
three providers are having issues (rate limits, quota, account restrictions).
"""
import os

from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")
HUGGINGFACE_MODEL = "deepseek-ai/DeepSeek-V4-Flash-0731:baseten"


def call_openai(system_prompt, user_prompt):
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
    )
    return response.choices[0].message.content.strip()


def call_gemini(system_prompt, user_prompt):
    from google import genai

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=f"{system_prompt}\n\n{user_prompt}",
    )
    return response.text.strip()


def call_huggingface(system_prompt, user_prompt):
    from huggingface_hub import InferenceClient

    client = InferenceClient(api_key=HUGGINGFACE_API_KEY)
    response = client.chat.completions.create(
        model=HUGGINGFACE_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
    )
    return response.choices[0].message.content.strip()


def call_llm_with_fallback(system_prompt, user_prompt):
    """Returns (response_text, provider_used)."""
    errors = []

    if OPENAI_API_KEY:
        try:
            return call_openai(system_prompt, user_prompt), "openai"
        except Exception as e:
            errors.append(f"OpenAI: {e}")
            print(f"OpenAI call failed ({e}), falling back to Gemini...")

    if GEMINI_API_KEY:
        try:
            return call_gemini(system_prompt, user_prompt), "gemini"
        except Exception as e:
            errors.append(f"Gemini: {e}")
            print(f"Gemini call failed ({e}), falling back to Hugging Face...")

    if HUGGINGFACE_API_KEY:
        try:
            return call_huggingface(system_prompt, user_prompt), "huggingface"
        except Exception as e:
            errors.append(f"Hugging Face: {e}")

    if errors:
        raise RuntimeError(f"All configured LLM providers failed. {'; '.join(errors)}")

    raise RuntimeError(
        "No LLM API key configured — set at least one of OPENAI_API_KEY, "
        "GEMINI_API_KEY, HUGGINGFACE_API_KEY in .env"
    )
