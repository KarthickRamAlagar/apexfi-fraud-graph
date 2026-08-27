"""Shared visual styling across every Streamlit page — glassmorphism theme
and the rotating Lion Capital emblem in the sidebar, matching the same
image/animation used on the React app's "Ask your data" page.
"""
import base64
import os

import streamlit as st

ASSET_PATH = os.path.join(os.path.dirname(__file__), "assets", "ashoka-lion-capital.png")

# Matches the React app's DesktopOnlyGate threshold exactly — phones blocked,
# tablets and up allowed.
MIN_WIDTH_PX = 768


def apply_desktop_only_gate():
    """CSS-only gate (no JS needed) — a full-screen overlay that's hidden
    by default and only shown below MIN_WIDTH_PX, via a media query. Same
    wording as the React app's gate, for consistency."""
    st.markdown(
        f"""
        <style>
        .apexfi-desktop-gate {{
            display: none;
        }}
        @media (max-width: {MIN_WIDTH_PX - 1}px) {{
            .apexfi-desktop-gate {{
                display: flex !important;
                position: fixed;
                inset: 0;
                z-index: 999999;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 16px;
                padding: 32px;
                text-align: center;
                background: radial-gradient(circle at 20% 20%, #1e2340 0%, #0a0e1a 45%, #05070d 100%);
            }}
            .apexfi-desktop-gate h1 {{
                font-size: 1.25rem;
                color: #f4f5fb;
                margin: 0;
            }}
            .apexfi-desktop-gate p {{
                font-size: 0.9rem;
                color: rgba(232, 234, 245, 0.7);
                max-width: 320px;
                margin: 0;
            }}
        }}
        </style>
        <div class="apexfi-desktop-gate">
            <h1>ApexFi Deep EDA is built for larger screens</h1>
            <p>
                This is a financial data-profiling tool, best viewed on a laptop
                or desktop — for the full experience, please open it on a
                larger screen.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def apply_glassmorphism():
    st.markdown(
        """
        <style>
        /* gradient backdrop behind everything, so the glass panels have
           something to actually look translucent against */
        [data-testid="stAppViewContainer"] {
            background: radial-gradient(circle at 20% 20%, #1e2340 0%, #0a0e1a 45%, #05070d 100%);
        }
        [data-testid="stHeader"] {
            background: transparent;
        }

        /* sidebar: frosted glass panel */
        [data-testid="stSidebar"] {
            background: rgba(20, 24, 45, 0.45);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            border-right: 1px solid rgba(255, 255, 255, 0.08);
        }
        [data-testid="stSidebar"] * {
            color: #e8eaf5 !important;
        }

        /* main content blocks: glass cards */
        [data-testid="stVerticalBlockBorderWrapper"],
        div[data-testid="stMetric"],
        .stDataFrame,
        [data-testid="stExpander"] {
            background: rgba(255, 255, 255, 0.05) !important;
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 14px;
        }

        div[data-testid="stMetric"] {
            padding: 12px 16px;
        }

        h1, h2, h3 {
            color: #f4f5fb;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_sidebar_emblem():
    """Rotating Lion Capital emblem in the sidebar, same 6s 360° Y-axis
    spin as the React GovEmblem component."""
    if not os.path.exists(ASSET_PATH):
        return

    with open(ASSET_PATH, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    st.sidebar.markdown(
        f"""
        <style>
        @keyframes lion-capital-spin-streamlit {{
            from {{ transform: rotateY(0deg); }}
            to {{ transform: rotateY(360deg); }}
        }}
        .sidebar-emblem-wrap {{
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            margin: 28px 0 4px 0;
        }}
        .sidebar-emblem-stage {{
            perspective: 1200px;
            width: 190px;
            height: 230px;
        }}
        .sidebar-emblem-img {{
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 6px 18px rgba(184, 134, 11, 0.4));
            animation: lion-capital-spin-streamlit 6s linear infinite;
            transform-style: preserve-3d;
        }}
        .sidebar-emblem-label {{
            text-align: center;
            font-size: 0.8rem;
            color: rgba(232, 234, 245, 0.65);
            margin-bottom: 16px;
        }}
        </style>
        <div class="sidebar-emblem-wrap">
            <div class="sidebar-emblem-stage">
                <img class="sidebar-emblem-img" src="data:image/png;base64,{b64}" />
            </div>
        </div>
        <div class="sidebar-emblem-label">ApexFi</div>
        """,
        unsafe_allow_html=True,
    )