# ApexFi monitoring (Prometheus + Grafana, no Docker)

How it flows: ApexFi API (`/metrics`) -> Prometheus (port 9090) -> Grafana (port 3000).

1. Start ApexFi: `bash run_all.sh`
2. Check the API: http://localhost:8000/metrics (plain text starting with `# HELP apexfi_up`)
3. Start Prometheus with `monitoring/prometheus.yml`. Check http://localhost:9090/targets shows `apexfi` as UP.
4. Start Grafana. Open http://localhost:3000 (first login: admin / admin).
5. Grafana > Connections > Data sources > Add > Prometheus > URL `http://localhost:9090` > Save and test.
6. Grafana > Dashboards > New > Import > upload `monitoring/grafana/apexfi_performance_dashboard.json`, choose the Prometheus data source, Import.
