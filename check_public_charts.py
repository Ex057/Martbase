#!/usr/bin/env python3
from superset import db
from superset.models.slice import Slice

charts = db.session.query(Slice).filter(Slice.id.in_([236, 237, 238, 710, 711])).all()
print(f"\nFound {len(charts)} charts:")
for chart in charts:
    is_public = getattr(chart, 'is_public', False)
    print(f"  Chart {chart.id}: '{chart.slice_name}' - is_public={is_public}")
