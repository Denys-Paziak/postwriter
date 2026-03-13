import os
import sqlite3
from google import genai

def test_gemini():
    db_path = "/Users/alinakasko/Documents/Postwritter/postwriter/server/smm.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT gemini_api_key FROM author_profile WHERE id = 1").fetchone()
    api_key = row["gemini_api_key"]
    print(f"Using API Key: {api_key[:10]}...")
    
    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents="Hello, say test.",
        )
        print(f"Success: {response.text}")
    except Exception as e:
        print(f"Error with gemini-2.0-flash: {e}")
        try:
            response = client.models.generate_content(
                model="gemini-1.5-flash",
                contents="Hello, say test.",
            )
            print(f"Success with gemini-1.5-flash: {response.text}")
        except Exception as e2:
            print(f"Error with gemini-1.5-flash: {e2}")

if __name__ == "__main__":
    test_gemini()
