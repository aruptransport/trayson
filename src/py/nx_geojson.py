import networkx as nx

def nx_to_geojson(g, ntaz=0):
    gj = []
    for n1,n2,tags in g.edges(data=True):
        gj.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [ g.nodes[n1]['lon'], g.nodes[n1]['lat'] ],
                    [ g.nodes[n2]['lon'], g.nodes[n2]['lat'] ]
                ]
            },
            "properties": tags,
            "id": "{},{}".format(n1,n2)
        })
    for n,tags in g.nodes(data=True):
        gj.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [ tags['lon'], tags['lat'] ]
            },
            "properties": {"taz": tags['taz']},
            "id": n
        })

    return {
        "type": "FeatureCollection",
        "features": gj
    }

def geojson_to_nx(gj):
    g = nx.DiGraph()

    if gj.get('type') == 'FeatureCollection':
        gj = gj['features']

    for ent in gj:
        if ent['geometry']['type'] == 'LineString': #edge
            n1, n2 = [int(n) for n in ent['id'].split(',')]
            g.add_edge(n1,n2,**ent['properties'])
        elif ent['geometry']['type'] == 'Point': #node
            g.add_node(int(ent['id']),
                       lon=ent['geometry']['coordinates'][0],
                       lat=ent['geometry']['coordinates'][1],
                       taz=ent['properties']['taz']
                       )

    return g
