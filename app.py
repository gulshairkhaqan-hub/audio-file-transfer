

import os
import streamlit as st
import requests
import time

SERVER_URL = os.getenv("SERVER_URL", "http://127.0.0.1:8000")
st.set_page_config(page_title="Audio File Transfer")
st.title("Audio File Transfer")
st.caption("Upload an audio file to the server and download it back · FastAPI + Streamlit")

st.divider()


with st.container(border=True):
    st.subheader("Section 1 — Upload Audio File")

  
    audio_file = st.file_uploader(
        "Choose an audio file (.mp3, .wav, .ogg, .flac, .aac, .m4a)",
        type=["mp3", "wav", "ogg", "flac", "aac", "m4a"],
    )

  
    if st.button("Upload to Server"):
        if audio_file is None:
            st.warning("First choose and audio file.")
        else:
            files = {"file": (audio_file.name, audio_file.getvalue(), audio_file.type)}
            try:
                response = requests.post(f"{SERVER_URL}/receive", files=files)
                if response.status_code == 200:
                    st.success(response.json()["message"])
                else:
                    st.error(f"Upload failed: {response.text}")
            except requests.exceptions.ConnectionError:
                st.error(" Server se connect nahi huwa first check kary  server chal raha hai ya nhi ")

st.divider()

with st.container(border=True):
    st.subheader("Section 2 — Download Audio from Server")

    if st.button("Request from Server"):
        try:
            response = requests.get(f"{SERVER_URL}/send")
            if response.status_code == 200:
                size_kb = len(response.content) // 1024
                st.success(f" File received from server successfully! ({size_kb} KB)")

                disposition = response.headers.get("content-disposition", "")
                file_name = "downloaded_audio.mp3"
                if "filename=" in disposition:
                    file_name = disposition.split("filename=")[-1].strip('"; ')

                st.audio(response.content, format="audio/wav")

                st.download_button(
                    "Save File Locally",
                    data=response.content,
                    file_name=file_name,
                )
            else:
                try:
                    error_msg = response.json().get("error", "Koi file available nahi hai.")
                except ValueError:
                    error_msg = f"Server error (status {response.status_code})"
                st.error(error_msg)
        except requests.exceptions.ConnectionError:
            st.error(" Server se connect nhi huwa . Kya server chal raha hai?")