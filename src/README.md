# Reusable source code

The original project contains no standalone Python source files; its analysis and model workflows are notebook-based. The `data/`, `features/`, `models/`, and `visualization/` folders are reserved for reusable components if they are later extracted and validated. Keeping them empty avoids creating a second, potentially divergent implementation of the existing notebook logic.
