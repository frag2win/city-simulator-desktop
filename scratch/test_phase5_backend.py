import sys
import os
import json

# Add project root to path
sys.path.append(os.path.join(os.getcwd(), 'python-sidecar'))

from app.services.schema_normalizer import normalize_overpass_response

def test_categorization():
    mock_data = {
        "elements": [
            {"type": "node", "id": 1, "lat": 52.5, "lon": 13.4},
            {"type": "node", "id": 2, "lat": 52.51, "lon": 13.4},
            {"type": "node", "id": 3, "lat": 52.51, "lon": 13.41},
            {"type": "node", "id": 4, "lat": 52.52, "lon": 13.42},
            {"type": "node", "id": 5, "lat": 52.53, "lon": 13.43},
            {"type": "node", "id": 6, "lat": 52.54, "lon": 13.44},
            {"type": "node", "id": 7, "lat": 52.55, "lon": 13.45},
            {"type": "node", "id": 8, "lat": 52.56, "lon": 13.46},
            {
                "type": "way",
                "id": 123,
                "nodes": [1, 2, 3, 1],
                "tags": {
                    "natural": "wood",
                    "name": "Test Forest"
                }
            },
            {
                "type": "way",
                "id": 456,
                "nodes": [4, 5],
                "tags": {
                    "man_made": "pipeline",
                    "substance": "gas"
                }
            },
            {
                "type": "way",
                "id": 789,
                "nodes": [6, 7, 8],
                "tags": {
                    "highway": "primary",
                    "tunnel": "yes",
                    "layer": "-1"
                }
            }
        ]
    }

    print("Running normalization test...")
    geojson = normalize_overpass_response(mock_data)
    
    features = geojson['features']
    print(f"Normalized {len(features)} features.")
    
    for f in features:
        props = f['properties']
        cat = props['osm_type']
        name = props.get('name', 'unnamed')
        is_tunnel = props.get('is_tunnel', False)
        layer = props.get('layer', 0)
        
        print(f" - [{cat}] {name}: tunnel={is_tunnel}, layer={layer}")
        
        if cat == 'vegetation' and name == 'Test Forest':
            print("   [OK] Vegetation correctly identified.")
        if cat == 'pipeline':
            print("   [OK] Pipeline correctly identified.")
        if cat == 'highway' and is_tunnel:
            print("   [OK] Tunnel property correctly identified.")

if __name__ == "__main__":
    test_categorization()
