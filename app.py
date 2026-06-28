import os
import streamlit as st
import requests

SERVER_URL = os.getenv("SERVER_URL", "http://127.0.0.1:8000")

st.set_page_config(page_title="Audio File Transfer")
st.title("Audio File Transfer")
st.caption("Upload audio files to Cloudinary via the server and download them back · FastAPI + Streamlit")

st.divider()


# ---------------- Section 1: Upload ----------------
with st.container(border=True):
    st.subheader("Section 1 — Upload Audio File(s)")

    audio_files = st.file_uploader(
        "Choose one or more audio files (.mp3, .wav, .ogg, .flac, .aac, .m4a)",
        type=["mp3", "wav", "ogg", "flac", "aac", "m4a"],
        accept_multiple_files=True,
    )

    if st.button("Upload to Server"):
        if not audio_files:
            st.warning("First choose at least one audio file.")
        else:
            files_payload = [
                ("files", (f.name, f.getvalue(), f.type)) for f in audio_files
            ]
            try:
                response = requests.post(f"{SERVER_URL}/receive", files=files_payload)
                if response.status_code == 200:
                    data = response.json()
                    st.success(data["message"])
                    # Section 1 only confirms the upload and lists the names.
                    # Playing / downloading is done in Section 2 via "Get from Server".
                    st.markdown("**Uploaded files:**")
                    for item in data.get("files", []):
                        st.write(f"• {item['name']}")
                else:
                    st.error(f"Upload failed: {response.text}")
            except requests.exceptions.ConnectionError:
                st.error("Server se connect nahi huwa. Pehle check karein server chal raha hai ya nahi.")

st.divider()


# ---------------- Section 2: View & Download ----------------
with st.container(border=True):
    st.subheader("Section 2 — All Files on Server (Cloudinary)")
    st.caption("Newest files appear first. Type in the box to quickly search by name.")

    st.button("Refresh File List")

    try:
        list_resp = requests.get(f"{SERVER_URL}/files")
        if list_resp.status_code == 200:
            data = list_resp.json()
            files_on_server = data.get("files", [])

            if not files_on_server:
                st.info("No files on server yet. Upload something in Section 1.")
            else:
                st.write(f"**{data['count']} file(s) stored on Cloudinary:**")
                # Newest first (backend already sorts); selectbox lets user type to search.
                url_map = {item["name"]: item["url"] for item in files_on_server}
                selected = st.selectbox(
                    "Search / choose a file to download or play",
                    list(url_map.keys()),
                )

                if st.button("Get from Server"):
                    file_url = url_map[selected]
                    file_resp = requests.get(file_url)
                    if file_resp.status_code == 200:
                        size_kb = len(file_resp.content) // 1024
                        st.success(f"'{selected}' received ({size_kb} KB)")
                        st.audio(file_resp.content)
                        st.download_button(
                            "Save File Locally",
                            data=file_resp.content,
                            file_name=selected,
                        )
                        st.caption(f"Permanent link: {file_url}")
                    else:
                        st.error("Could not download the file from Cloudinary.")
        else:
            st.error(f"Could not fetch file list from server. {list_resp.text}")
    except requests.exceptions.ConnectionError:
        st.error("Server se connect nahi huwa. Kya server chal raha hai?")
