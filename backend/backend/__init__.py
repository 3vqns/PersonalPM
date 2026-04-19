"""Compatibility package for deployments rooted at ``backend/``.

When Vercel deploys the ``backend`` directory as the project root, modules like
``main.py`` and ``config.py`` live at the filesystem root of the function
bundle. This package points ``backend.*`` imports back to that root so the same
import paths work both locally and in Vercel.
"""

from pathlib import Path

_package_dir = Path(__file__).resolve().parent
__path__ = [str(_package_dir.parent)]

