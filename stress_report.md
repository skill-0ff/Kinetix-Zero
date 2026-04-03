
# Kinetix-Zero Component Stress Test Report

## 1. Vectorizer Throughput
--- Vectorizer Benchmark (10000 iterations) ---
[Warning] Config load error: Expecting ',' delimiter: line 1 column 218 (char 217)
Starting processing...
Processed 10000 packets in 0.7184 seconds.
Resulting EPS: 13920.56
Vector Dimension Check: 34
----------------------------------------


## 2. AI Inference (Transformer VAE) Throughput
Error running benchmark: Command '['python', 'tests/stress/bench_ai.py']' returned non-zero exit status 1.

## Summary Findings
- The **Vectorizer** shows the raw overhead of packet normalization and hashing.
- The **AI Inference** throughput measures the batch processing and model execution speed.
- The **Collector** throughput can be monitored in real-time by running the `packet_generator.py` against a live instance.

> [!NOTE]
> AI EPS depends heavily on whether CUDA (GPU) is available. Vectorizer EPS is mostly CPU-bound.
