"""Single source of truth for project scope and filesystem locations."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ProjectConfig:
    root: Path
    carrier: str = "WN"
    period_label: str = "2026-01_to_2026-04"
    target_delay_minutes: int = 15
    max_arrival_hours: int = 30
    max_turnaround_hours: int = 24
    scenario_buffers_minutes: tuple[int, ...] = (0, 15, 30)

    @property
    def raw_dir(self) -> Path:
        return self.root / "data" / "raw"

    @property
    def processed_dir(self) -> Path:
        return self.root / "data" / "processed"

    @property
    def timezone_file(self) -> Path:
        return self.root / "data" / "reference" / "airport_timezones.csv"

    @property
    def dashboard_data_file(self) -> Path:
        return self.root / "dashboard" / "dashboard-data.js"


def find_project_root(start: Path | None = None) -> Path:
    """Find the repository root by locating the reference timezone file."""
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / "data" / "reference" / "airport_timezones.csv").is_file():
            return candidate
    raise FileNotFoundError("Could not locate the flight project root.")


def default_config(start: Path | None = None) -> ProjectConfig:
    return ProjectConfig(root=find_project_root(start))
