# About ApexFi

ApexFi is a UPI/IMPS-style fraud detection prototype built as an M.Tech project at Amrita Vishwa Vidyapeetham, Bengaluru (Amrita School of Computing).

**Author:** Karthikeyan R, M.Tech (Data Science)
**Guide:** Dr. Gurupriya M, Assistant Professor, Computer Science and Engineering

## What it does

It tests one question: how much of a fraud model's score survives when the test data come strictly later than the training data? It also checks whether a transaction graph built only from earlier transactions helps, and prices the result in money and SDG terms.

## Data

Real UPI/IMPS data is not public, so two proxy datasets are used: IEEE-CIS (card transactions) and DGraph-Fin (account graph). Neither is UPI traffic, and the project does not claim otherwise. DGraph-Fin's `node_timestamp` leaks the label, so it is excluded from the graph experiment.

## Stack

Python (uv), PostgreSQL, LightGBM, PyTorch Geometric (GraphSAGE), SHAP, FastAPI, React with Vite.

## Limits

One seed for the main benchmark; US card data; cost assumptions in the SDG Lab; no user login yet. See [All engines](ENGINES.md) and [Security](../SECURITY.md).

## Links

- Models: https://huggingface.co/karthifde/apexfi-fraud-detection
- Notebook: https://www.kaggle.com/code/karthifde/notebookd612b11733
- DGraph-Fin data: https://www.kaggle.com/datasets/karthifde/dgraph-fin-fraud-detection-network-data
