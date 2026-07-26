import streamlit as st
import requests
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)
SERVER_URL = os.getenv("SERVER_URL", "http://127.0.0.1:8000")

# Agar pehle se logged in hai toh main app pe bhejo
if st.session_state.get("logged_in"):
    st.switch_page("app.py")

st.title("📝 Sign Up")
st.caption("Already have an account? [Login here](/Login)")

st.divider()

with st.form("register_form"):
    name     = st.text_input("Full Name", placeholder="Ali Ahmed")
    email    = st.text_input("Email", placeholder="you@example.com")
    password = st.text_input("Password", type="password", placeholder="••••••••")
    submitted = st.form_submit_button("Create Account", use_container_width=True, type="primary")

if submitted:
    if not name or not email or not password:
        st.warning("Please fill in all fields.")
    elif len(password) < 6:
        st.warning("Password must be at least 6 characters.")
    else:
        try:
            resp = requests.post(
                f"{SERVER_URL}/register",
                json={"name": name, "email": email, "password": password},
                timeout=10,
            )
            if resp.status_code == 200:
                st.success("Account created! Please login.")
                st.switch_page("pages/1_login.py")
            else:
                st.error(resp.json().get("error", "Registration failed."))
        except requests.exceptions.ConnectionError:
            st.error("Server se connect nahi huwa.")
