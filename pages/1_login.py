import streamlit as st
import requests
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)
SERVER_URL = os.getenv("SERVER_URL", "http://127.0.0.1:8000")

st.set_page_config(page_title="Login", layout="centered")

# Agar pehle se logged in hai toh main app pe bhejo
if st.session_state.get("logged_in"):
    st.switch_page("app.py")

st.title(" Login")
st.caption("Don't have an account? [Register here](/Register)")

st.divider()

with st.form("login_form"):
    email    = st.text_input("Email", placeholder="you@example.com")
    password = st.text_input("Password", type="password", placeholder="••••••••")
    submitted = st.form_submit_button("Login", use_container_width=True, type="primary")

if submitted:
    if not email or not password:
        st.warning("Please fill in all fields.")
    else:
        try:
            resp = requests.post(
                f"{SERVER_URL}/login",
                json={"email": email, "password": password},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                # Session me save karo
                st.session_state["logged_in"] = True
                st.session_state["user_name"] = data.get("name", email)
                st.session_state["user_email"] = data.get("email", email.lower().strip())
                st.success(data["message"])
                st.switch_page("app.py")
            else:
                st.error(resp.json().get("error", "Login failed."))
        except requests.exceptions.ConnectionError:
            st.error("Server se connect nahi huwa.")
