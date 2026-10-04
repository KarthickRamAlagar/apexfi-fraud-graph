"""One-off helper: print a real transaction's actual raw field values, so
they can be re-entered into the Score New Transaction form for a true,
complete apples-to-apples validation test. Includes the C1-C14 counting
features and device telemetry fields now that the form supports them.
"""
import sys
from sqlalchemy import text
from etl.db.connection import get_engine

tid = int(sys.argv[1].replace("TX-", ""))
engine = get_engine()
with engine.connect() as conn:
    row = conn.execute(
        text("""SELECT transactionamt, productcd, card1, card2, card3, card4, card5, card6,
                        addr1, addr2, p_emaildomain, r_emaildomain, devicetype, deviceinfo,
                        c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14,
                        id_02, id_11, id_14, id_17, id_19, id_20, is_fraud
                 FROM gold.ieee_cis_features WHERE transactionid = :tid"""),
        {"tid": tid},
    ).mappings().fetchone()

print(f"\nReal field values for TX-{tid} (real label: {'FRAUD' if row['is_fraud'] else 'Normal'}):\n")
print("--- Form fields (Transaction / Card / Address / Email / Device) ---")
for k in ["transactionamt", "productcd", "card1", "card2", "card3", "card4", "card5", "card6",
          "addr1", "addr2", "p_emaildomain", "r_emaildomain", "devicetype", "deviceinfo"]:
    print(f"  {k}: {row[k]}")

print("\n--- Counting Features (C1-C14) ---")
for i in range(1, 15):
    print(f"  c{i}: {row[f'c{i}']}")

print("\n--- Device Telemetry ---")
for k in ["id_02", "id_11", "id_14", "id_17", "id_19", "id_20"]:
    print(f"  {k}: {row[k]}")