# Learning 01: uv & Modern Python Management

In Strata, we use **uv** as our primary tool for project management. It replaces traditional tools like `pip`, `venv`, and `pip-tools` with a single, high-performance binary.

## 1. Why uv?
*   **Speed:** It is 10-100x faster than `pip`.
*   **Single Tool:** It manages Python versions, virtual environments, and dependencies.
*   **Reproducibility:** It uses a `uv.lock` file to ensure every developer (and the CLI agent) has the exact same environment.

## 2. Key Concepts
*   **`pyproject.toml`:** The "manifest" of the project. It defines dependencies and CLI entry points.
*   **`uv sync`:** Synchronizes the local virtual environment with the lockfile.
*   **`uv run <command>`:** Runs a command within the isolated project environment without needing to manually "activate" a shell.

## 3. How we use it in Strata
We define our CLI tool as a script in `pyproject.toml`. This allows us to run `uv run strata` from anywhere in the project directory, ensuring the tool always has access to its dependencies like `libtorrent` and `cryptography`.
