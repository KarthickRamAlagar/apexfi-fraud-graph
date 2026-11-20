# ApexFi: all engines

ApexFi is built from four engines. Engine A scores transactions, Engine B prices the result, the performance engine keeps the app fast and observable, and the security engine protects the API.

## Engine A: detection

Reads the Gold tables in PostgreSQL, splits them by time, trains and tunes the models, explains them, and writes confusion counts.

- **Data:** IEEE-CIS (590,540 card transactions, about 3.5% fraud) is the main dataset. DGraph-Fin is used for graph checks and a leakage audit.
- **Split:** rows are sorted by time. The first 376,469 rows fit the models, the next 66,436 choose the threshold, and the last 147,635 rows (5,100 frauds) are scored once.
- **Models:** 25 classifiers are compared. The shipped detector is a tuned LightGBM. A causal GraphSAGE branch (edges only from earlier to later transactions) is stacked on it with a logistic regression.
- **Explanations:** TreeSHAP gives exact per-alert reasons.
- **Output:** the true and false positives, the amounts, and the threshold, passed to Engine B.
- **Paper results (full-data run, time-ordered):** PR-AUC 0.524, ROC-AUC 0.907, ECE 0.0076. A random split would show 0.845 for the best model, a drop of 38% in time order.

## Engine B: SDG Lab

Has no learnable parameters. It turns the payload from Engine A into money and SDG estimates.

- **Net benefit:** NB = 0.9 x value caught - $2 x (alerts) - $1 x (false alarms).
- **Break-even:** the model beats flagging every transaction once a false alarm costs customers more than about $1.35.
- **Range:** a Monte Carlo draw over the cost assumptions gives a scenario range.
- **SDG link:** SDGs 8, 9 and 16 are attached to the terms as a scenario reading, not a measured score.
- All dollar values are scenario outputs under stated assumptions, not observed UPI savings.

## Performance engine

- FastAPI backend, React frontend, PostgreSQL.
- `/metrics` exposes request counts and latency, Prometheus scrapes it every 5 s, and Grafana shows service state, scores, 5xx errors and per-route latency.
- Database indexes cut live scoring latency from 6,374 ms to 138 ms. Loading heavy predictors one after another and light ones in parallel cut start-up from 2 to 4 minutes to about 82 s. Both were measured on one local machine and are not load tests.

## Security engine

What is implemented is listed in [SECURITY.md](../SECURITY.md) and covered by `tests/test_security.py`: CORS from `ALLOWED_ORIGINS`, security headers, a 1 MB body cap, per-IP rate limiting with HTTP 429, request IDs, Pydantic input validation, guarded read-only SQL for Ask-your-data, parameterised queries, and production hardening. Not implemented yet: user login with role-based access, a secrets manager and an audit log. No formal compliance is claimed.
