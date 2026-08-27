"""Shared helper: fast Postgres bulk insert via COPY, for use with pandas.to_sql(method=...)."""
import csv
from io import StringIO


def psql_insert_copy(table, conn, keys, data_iter):
    dbapi_conn = conn.connection
    with dbapi_conn.cursor() as cur:
        s_buf = StringIO()
        writer = csv.writer(s_buf)
        writer.writerows(data_iter)
        s_buf.seek(0)
        columns = ", ".join(f'"{k}"' for k in keys)
        table_name = f'"{table.schema}"."{table.name}"' if table.schema else f'"{table.name}"'
        sql = f"COPY {table_name} ({columns}) FROM STDIN WITH CSV"
        cur.copy_expert(sql=sql, file=s_buf)