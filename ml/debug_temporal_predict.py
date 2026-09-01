"""Direct test of the temporal predictor's rolling-feature lookup,
bypassing the web UI entirely -- isolates whether a real bug is in the
backend logic itself, or somewhere between the frontend and it."""
from backend.services.temporal_predictor_service import get_temporal_predictor

predictor = get_temporal_predictor()

print("Direct call with card1=9500 (confirmed via SQL to have 8 real")
print("transactions, ₹702.40, in the dataset's true final hour):\n")

result = predictor.predict({"card1": 9500, "card2": 360, "addr1": 441, "p_emaildomain": "gmail.com", "deviceinfo": "KFFOWI Build/LVY48F"})

print("Real rolling features returned:")
for k, v in result["realRollingFeatures"].items():
    print(f"  {k}: {v}")

print(f"\nRisk score: {result['riskScore']}")