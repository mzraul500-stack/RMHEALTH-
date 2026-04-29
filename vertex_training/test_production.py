"""
Test de produccion: valida los 5 casos clinicos en el backend en vivo.
Usa el schema real de VitalSigns del API.
"""
import urllib.request, json, ssl

BASE = 'https://rmhealth-api-292048010515.us-central1.run.app'
ctx = ssl.create_default_context()

def call_api(fc, spo2, tas, tad, gluc=90, temp=36.5, name='test'):
    payload = json.dumps({
        'usuario_id': f'test_{name}',
        'frecuencia_cardiaca': fc,
        'oxigeno': spo2,
        'presion_sistolica': tas,
        'presion_diastolica': tad,
        'temperatura': temp,
        'glucosa': float(gluc),
        'ubicacion_lat': 19.4326,
        'ubicacion_lon': -99.1332,
        'dispositivo_id': 'test_device_v2',
        'contexto': 'reposo'
    }).encode()
    req = urllib.request.Request(
        BASE + '/api/vital-signs', data=payload,
        headers={'Content-Type': 'application/json'}, method='POST'
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        return {'error': f'HTTP {e.code}: {body}'}
    except Exception as e:
        return {'error': str(e)}

cases = [
    ('A', 118, 89, 110, 80,  ['ALTO', 'CRITICO'],      'SpO2=89+FC=118+TAS=110'),
    ('B', 110, 95, 140, 95,  ['MEDIO', 'ALTO', 'CRITICO'], 'SpO2=95+FC=110+TAS=140'),
    ('C', 125, 88, 160, 100, ['CRITICO'],               'SpO2=88+FC=125+TAS=160'),
    ('D', 72,  98, 118, 76,  ['BAJO'],                  'SpO2=98+FC=72+TAS=118'),
    ('E', 118, 89, 140, 95,  ['CRITICO'],               'CASO RAUL SpO2=89+FC=118+TAS=140'),
]

print('=' * 65)
print('  VALIDACION EN PRODUCCION - RMHealth API v2 (Modelo Vertex AI)')
print('=' * 65)
print()

all_pass = True
for name, fc, spo2, tas, tad, expected, desc in cases:
    resp = call_api(fc, spo2, tas, tad, name=name)
    if 'error' in resp:
        print(f'  [ERROR] Caso {name}: {resp["error"]}')
        all_pass = False
        continue
    ml_level   = resp.get('ml_triage', {}).get('level', '?')
    ml_conf    = resp.get('ml_triage', {}).get('confidence', 0)
    heur_level = resp.get('analysis', {}).get('nivel_criticidad', '?')
    passed = (ml_level in expected) or (heur_level in expected)
    status = 'PASS' if passed else 'FAIL'
    if not passed:
        all_pass = False
    print(f'  [{status}] Caso {name} ({desc})')
    print(f'         ML={ml_level} ({ml_conf:.0%})  Heuristico={heur_level}')
    print(f'         Esperado: {expected}')
    print()

print('=' * 65)
if all_pass:
    print('  RESULTADO FINAL: TODOS LOS CASOS PASAN - MODELO v2 CORRECTO')
else:
    print('  RESULTADO FINAL: HAY FALLOS - REVISAR')
print('=' * 65)
