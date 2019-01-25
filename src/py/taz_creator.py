import networkx as nx 
from statistics import mean

def connect_all(g, new_node, nodes_to_connect):
    attr = {
        "capacity": 15_000,
        "length": 0,
        "fftime": 0,
        "maxspeed": 200,
        'b': .7,
        'power': 0.4,
        "toll": 0,
        "type": 1,
        'ratio_api': 1,
        'fixed_flow': 0,
        'am_best_guess': 0,
        'api_ratio': 1,
        'ff_best_guess': 0,
        'lanes': 1,
        'name': ''
    }
        
    # add all and calculate TAZ position (in the middle of TAZ nodes)
    lats = []
    lons = []
    for node in nodes_to_connect:
        g.add_edge(node, new_node, **attr)
        g.add_edge(new_node, node, **attr)

        lats.append(g.nodes[node]['lat'])
        lons.append(g.nodes[node]['lon'])

    nx.set_node_attributes(g, {
        new_node: {
            'lat': mean(lats),
            'lon': mean(lons),
            'taz': True
        }
    })

def add_TAZs_to_network(g, tazList):
    for i,taz in enumerate(tazList):
        connect_all(g, i+1, taz)
    
    return g
