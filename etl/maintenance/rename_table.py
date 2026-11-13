from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE bronze.raw_money_rates RENAME TO raw_digital_payment_volume_monthly"))
    conn.commit()

print("Renamed bronze.raw_money_rates -> bronze.raw_digital_payment_volume_monthly")