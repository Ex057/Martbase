#!/usr/bin/env python3
"""
Script to tag charts with category tags for the enhanced home page.

Usage:
    python scripts/tag_charts.py

This script will:
1. Fetch all charts
2. Allow you to assign category tags to each chart
3. Save the tags to the database

Categories:
- analysis: Analysis / Dashboards
- predictions: Predictions
- exports: Data Exports
- indicators: Indicators
- reports: Reports
"""

from superset import app, db
from superset.models.slice import Slice
from superset.tags.models import Tag, TaggedObject, TagType, ObjectType


def get_or_create_tag(tag_name: str, tag_type: TagType = TagType.custom) -> Tag:
    """Get or create a tag."""
    tag = db.session.query(Tag).filter_by(name=tag_name, type=tag_type).first()
    if not tag:
        tag = Tag(name=tag_name, type=tag_type)
        db.session.add(tag)
        db.session.commit()
    return tag


def add_category_tag_to_chart(chart_id: int, category: str) -> None:
    """Add a category tag to a chart."""
    tag_name = f"category:{category}"
    tag = get_or_create_tag(tag_name)

    # Check if tag is already assigned
    existing = (
        db.session.query(TaggedObject)
        .filter_by(
            tag_id=tag.id,
            object_id=chart_id,
            object_type=ObjectType.chart,
        )
        .first()
    )

    if not existing:
        tagged_object = TaggedObject(
            tag_id=tag.id,
            object_id=chart_id,
            object_type=ObjectType.chart,
        )
        db.session.add(tagged_object)
        db.session.commit()
        print(f"✓ Tagged chart {chart_id} with '{tag_name}'")
    else:
        print(f"  Chart {chart_id} already has tag '{tag_name}'")


def list_charts() -> list[Slice]:
    """List all charts."""
    return db.session.query(Slice).order_by(Slice.slice_name).all()


def interactive_tagging() -> None:
    """Interactively tag charts."""
    charts = list_charts()

    if not charts:
        print("No charts found in the database.")
        return

    print("\n=== Chart Tagging Tool ===\n")
    print("Available categories:")
    print("  1. analysis    - Analysis / Dashboards")
    print("  2. predictions - Predictions")
    print("  3. exports     - Data Exports")
    print("  4. indicators  - Indicators")
    print("  5. reports     - Reports")
    print("  0. skip        - Skip this chart")
    print("  q. quit        - Exit\n")

    category_map = {
        "1": "analysis",
        "2": "predictions",
        "3": "exports",
        "4": "indicators",
        "5": "reports",
    }

    for i, chart in enumerate(charts, 1):
        print(f"\n[{i}/{len(charts)}] Chart: {chart.slice_name} (ID: {chart.id})")
        print(f"    Type: {chart.viz_type}")
        if chart.description:
            print(f"    Description: {chart.description[:80]}...")

        # Show existing category tags
        existing_tags = [
            tag.name for tag in chart.tags
            if tag.name.startswith("category:")
        ]
        if existing_tags:
            print(f"    Current tags: {', '.join(existing_tags)}")

        choice = input("    Select category (1-5, 0 to skip, q to quit): ").strip()

        if choice.lower() == "q":
            print("\nExiting...")
            break

        if choice == "0":
            print("    Skipped")
            continue

        if choice in category_map:
            category = category_map[choice]
            add_category_tag_to_chart(chart.id, category)
        else:
            print("    Invalid choice, skipped")


def bulk_tag_all(category: str) -> None:
    """Tag all charts with a specific category."""
    charts = list_charts()
    print(f"\nTagging {len(charts)} charts with category '{category}'...")

    for chart in charts:
        add_category_tag_to_chart(chart.id, category)

    print(f"\n✓ Successfully tagged {len(charts)} charts")


if __name__ == "__main__":
    import sys

    with app.app_context():
        if len(sys.argv) > 1:
            # Bulk mode: python tag_charts.py analysis
            category = sys.argv[1]
            valid_categories = ["analysis", "predictions", "exports", "indicators", "reports"]

            if category not in valid_categories:
                print(f"Error: Invalid category '{category}'")
                print(f"Valid categories: {', '.join(valid_categories)}")
                sys.exit(1)

            bulk_tag_all(category)
        else:
            # Interactive mode
            interactive_tagging()
