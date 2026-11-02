# M4 check (one question for Bronze)

Gold column `m4` is 100% empty (0 of 590,540). In the original IEEE-CIS data M4 holds M0, M1 or M2. The Silver step keeps only T/F, so
everything else becomes NULL. Confirm it with this query on the Bronze table:

    select m4, count(*) from bronze.raw_ieee_cis group by 1 order by 2 desc;

Expected if the defect is real: M0, M1, M2 and some NULL. In psql:

    psql -U <your_user> -d <your_db> -c "select m4, count(*) from bronze.raw_ieee_cis group by 1 order by 2 desc;"

Send me the output. Then I will give you the exact Silver-step fix (a few lines in etl/.../bronze_to_silver_ieee_cis.py) and the re-run order
(Silver, then Gold, then the V2 pipeline). Do not re-run the ETL before that.
