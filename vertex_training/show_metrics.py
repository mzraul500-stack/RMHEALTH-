import json

with open('h:/RMHEALTH/models/triage_metrics_v2_raw.json') as f:
    m = json.load(f)

print('='*55)
print('   RESULTADOS VERTEX AI - RMHealth Triage v2')
print('='*55)
print(f"Accuracy global:   {m['accuracy']*100:.2f}%")
print(f"Recall CRITICO:    {m['recall_critico']*100:.2f}%  (minimo: 90%)")
deploy = 'SI' if m['deploy_approved'] else 'NO'
print(f"Deploy aprobado:   {deploy}")
print()
print('Metricas por clase:')
cr = m['classification_report']
for lbl in ['BAJO','MEDIO','ALTO','CRITICO']:
    d = cr[lbl]
    print(f"  {lbl:<8} Precision={d['precision']*100:.1f}%  Recall={d['recall']*100:.1f}%  F1={d['f1-score']*100:.1f}%  (n={int(d['support'])})")
print()
print('Importancias de features (top 8):')
fi = sorted(m['feature_importances'].items(), key=lambda x: -x[1])
for feat, imp in fi[:8]:
    bar = '#' * int(imp * 200)
    print(f"  {feat:<28} {imp*100:5.1f}%  {bar}")
print()
print('Casos clinicos de Raul:')
for c in m.get('clinical_cases', []):
    st = 'PASS' if c['passed'] else 'FAIL'
    print(f"  [{st}] {c['case']:<22} -> {c['prediction']:<8}  esperado: {c['expected']}")
print()
passed = m.get('clinical_cases_passed', False)
print(f"Todos los casos pasan: {'SI' if passed else 'NO'}")
print()
if m['deploy_approved'] and passed:
    print("RESULTADO: MODELO APROBADO - Listo para deploy")
else:
    print("RESULTADO: MODELO NO APROBADO - No se despliega")
