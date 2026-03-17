import py_compile
import sys

try:
    py_compile.compile('engine/ai/inference.py', doraise=True)
    print("No syntax errors found.")
except py_compile.PyCompileError as e:
    print(f"Syntax error found: {e}")
    sys.exit(1)
