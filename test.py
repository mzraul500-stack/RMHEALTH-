import os
import requests

token = os.environ.get("API_SECRET_TOKEN")
if not token:
    raise SystemExit("ERROR: Set API_SECRET_TOKEN environment variable before running this test.")

url = "https://rmhealth-api-358326204697.us-central1.run.app/api/emergencies/history"
headers = {"Authorization": f"Bearer {token}"}
response = requests.get(url, headers=headers)
print(response.status_code)
print(response.text)
