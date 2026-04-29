import urllib.request, json, ssl

ctx = ssl.create_default_context()
url = 'https://rmhealth-api-292048010515.us-central1.run.app/openapi.json'
req = urllib.request.Request(url, method='GET')
with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
    data = json.loads(r.read())

schema = data['components']['schemas']['VitalSigns']
props = schema.get('properties', {})
required = schema.get('required', [])
print('Campos del VitalSigns schema:')
for k, v in props.items():
    req_flag = 'REQUERIDO' if k in required else 'opcional'
    typ = v.get('type', '?')
    print(f'  {k}: {typ} ({req_flag})')
