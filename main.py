import streamlit as st

st.set_page_config(page_title="Audio File Transfer", layout="centered")

# Conditional navigation based on login state
if st.session_state.get("logged_in"):
    pages = [
        st.Page("app.py", title="App", icon="🎵"),
    ]
else:
    pages = [
        st.Page("pages/1_login.py", title="Login", icon="🔐"),
        st.Page("pages/2_Register.py", title="Sign Up", icon="📝"),
    ]

pg = st.navigation(pages)
pg.run()
