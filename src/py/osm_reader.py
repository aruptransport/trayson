from geopy.distance import geodesic
import networkx as nx
import osmread
import numpy as np
import pandas as pd
from statistics import median

def ways_filter(tags): # if True, we should filter out this way
    # filter for roads that are "highways" that aren't service, residential, or private roads
    
    whitelist = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified'}
    
    return not ((tags.get('highway') in whitelist) and (tags.get('access') != 'private'))

## dropping rels/turn retrictions for now
# def rels_filter(tags): # True: filter out this relation
#     # filter for restricted nodes
#     return not (('restriction' in tags) and (tags['restriction'] != 'no_u_turn'))

def read_osm(filepath):

    nodes = {}
    ways = []
    # rels = []

    # Extract the nodes and the ways
    for entity in osmread.parse_file(filepath):

        if isinstance(entity, osmread.Node) :
            # don't really need anything about the nodes except their lon and lat i don't think
            nodes[entity.id] = (entity.lon, entity.lat)

        elif isinstance(entity, osmread.Way) and (not ways_filter(entity.tags)):
        
            # convert speed limit from string to int.
            # NOTE: assumes in US/all limits are in MPH
            if 'maxspeed' in entity.tags: 
                try:
                    entity.tags['maxspeed'] = int(entity.tags['maxspeed'][:-4])
                except ValueError:
                    try: # someone probably forgot to put a mph on it
                        entity.tags['maxspeed'] = int(entity.tags['maxspeed'])
                    except ValueError: # blank maxspeed, probably
                        del entity.tags['maxspeed']
            
            # treat links like regular roads
            if entity.tags['highway'][-5:] == '_link':
                entity.tags['highway'] = entity.tags['highway'][:-5]
            
            # ensure consistency on lanes
            entity.tags['lanes'] = int(entity.tags.get('lanes', 0))
            
            ways.append(entity)

        # elif isinstance(entity, osmread.Relation) and (not rels_filter(entity.tags)):
        #     rels.append(entity) # TBD what to do with this

    # return nodes, ways, rels
    return nodes, ways

def construct_graph(nodes, ways):
    
    g = nx.DiGraph()
    
    # add edges to graph
    for way in ways:

        # initial lane count, removing non-auto lanes
        lanes = (int(way.tags['lanes']) if 'lanes' in way.tags else 2)
        psv_lanes = (int(way.tags['lanes:psv']) if 'lanes:psv' in way.tags else 0)
        lanes -= psv_lanes

        # check directionality
        if (way.tags.get('oneway') == 'yes'): # it's a one-way st
            for i in range(len(way.nodes)-1):
                g.add_edge(way.nodes[i], way.nodes[i+1], id=way.id, uid=way.uid, tags=way.tags)
        else: # 'oneway' is no OR no 'oneway' present (implicit 2-way)
            lanes_forward = lanes // 2
            lanes_backward = lanes // 2
            if (way.tags.get('lanes:forward')):
                lanes_forward = int(way.tags['lanes:forward']) - psv_lanes//2
            if (way.tags.get('lanes:backward')):
                lanes_backward = int(way.tags['lanes:backward']) - psv_lanes//2
        
            for i in range(len(way.nodes)-1):                
                # add edge
                way.tags['lanes'] = lanes_forward
                g.add_edge(way.nodes[i], way.nodes[i+1], id=way.id, uid=way.uid, tags=way.tags)
                way.tags['lanes'] = lanes_backward
                g.add_edge(way.nodes[i+1], way.nodes[i], id=way.id, uid=way.uid, tags=way.tags)
    
    # drop nodes/subgraphs that aren't connected to the main body of the graph
    g = max(nx.weakly_connected_component_subgraphs(g), key=len) 

    for node in g.nodes():
        g.nodes[node]['lat'] = nodes[node][1]
        g.nodes[node]['lon'] = nodes[node][0]
        
    return g

def calc_length(g):
    for edge in g.edges():
        g.edges[edge]['length'] = geodesic((g.nodes[edge[0]]['lat'],g.nodes[edge[0]]['lon']), (g.nodes[edge[1]]['lat'],g.nodes[edge[1]]['lon'])).miles
        if 'length' in g.edges[edge]['tags']:
            del g.edges[edge]['tags']['length'] # delete because provided property can be confusing
    return g

def replace_node_with_edge(g, ie, oe, oneway): # from_node, to_node, reference edge
    # assumes same way but different segments
    # does not delete node (done outside)
    new_edges = [(ie[0],oe[1])]
    if not oneway:
        new_edges.append((oe[1],ie[0]))
    for new_edge in new_edges:
        attr = {
            'id': g.edges[ie]['id'],
            'tags': g.edges[ie]['tags'].copy(),
            'length': g.edges[ie]['length'] + g.edges[oe]['length']
        }
        
        if ('name' in g.edges[ie]) and ('name' in g.edge[oe]) and (g.edges[ie]['name'] == g.edges[oe]['name']):
            attr['name'] = g.edges[ie]['name']
        
        g.add_edge(*new_edge, **attr)
        
def replace_node_with_edge_adv(g, ie, oe, oneway): # from_node, to_node, reference edge
    # does not delete node (done outside)
    
    # dict to determine smaller road
    road_class = { 
        'motorway' : 5,
        'trunk' : 4,
        'primary' : 3,
        'secondary' : 2,
        'tertiary' : 1,
        'unclassified' : 0,
#         'residential' : -1,
#         'service' : -2
    }
    
    new_edges = [(ie[0],oe[1])]
    if not oneway:
        new_edges.append((oe[1],ie[0]))
        
    tags = {}
    # take minimum maxspeed if available
    maxspeed = []
    if 'maxspeed' in g.edges[ie]['tags']:
        maxspeed.append(g.edges[ie]['tags'].get('maxspeed'))
    if 'maxspeed' in g.edges[oe]['tags']:
        maxspeed.append(g.edges[oe]['tags'].get('maxspeed'))
    if len(maxspeed)>0:
        tags['maxspeed'] = min(maxspeed)
    # take minimum lanes if available
    lanes = []
    if 'lanes' in g.edges[ie]['tags']:
        lanes.append(g.edges[ie]['tags'].get('lanes'))
    if 'lanes' in g.edges[oe]['tags']:
        lanes.append(g.edges[oe]['tags'].get('lanes'))
    if len(lanes)>0:
        tags['lanes'] = min(lanes)
    # take name if we can be sure the links we're connecting are the same
    if ('name' in g.edges[ie]['tags']) and ('name' in g.edges[oe]['tags']) and (g.edges[ie]['tags']['name'] == g.edges[ie]['tags']['name']):
        tags['name'] = g.edges[ie]['tags']['name']
    # determine smaller highway type and take that
    intype = road_class[g.edges[ie]['tags']['highway']]
    outype = road_class[g.edges[oe]['tags']['highway']]
    if intype < outype: # outtype is smaller road. take its properties.
        tags['highway'] = g.edges[oe]['tags']['highway']
        if 'name' in g.edges[oe]['tags']:
            tags['name'] = g.edges[oe]['tags']['name']
    else: # intype is smaller road. take its properties.
        tags['highway'] = g.edges[ie]['tags']['highway']
        if 'name' in g.edges[ie]['tags']:
            tags['name'] = g.edges[ie]['tags']['name']
    
    for new_edge in new_edges:
        g.add_edge(*new_edge)
        g.edges[new_edge].update({
            'id': g.edges[ie]['id'],
            'tags': tags,
            'length': g.edges[ie]['length'] + g.edges[oe]['length']
        })

def simplify_graph(g):
    g = g.copy()
    
    # for each deleted node, track it to a node still in the graph for use in trip table
#     node_tl = {}
    
    last_count = len(g.nodes())
    # PART I: only delete nodes in the middle of one-way streets, or two way streets that were originally broken up during graph creation
    while True: # scary notation! break check at end of while loop (always want it to run at least once)
        
        nodes_to_remove = []
        for node in g.nodes():
#             if (node not in node_tl):
#                 # init node tracking to self
#                 node_tl[node] = node 
            
            inn = list(g.in_edges(node))
            out = list(g.out_edges(node))

            # CONSERVATIVE CONSTRAINTS
            # simplify one way streets, but doesn't delete nodes at the end of two-way streets
            if (len(inn) == len(out) == 1) and (g.edges[inn[0]]['id'] == g.edges[out[0]]['id']) and (inn[0][0] != out[0][1]):
                replace_node_with_edge(g,inn[0],out[0],oneway=True)
                nodes_to_remove.append(node)
                g.remove_edges_from(inn+out)
#                 node_tl[node] = inn[0][0] # attach deleted node to node prior

            # simplify two-way: if in_edges() is 2 AND out_edges() is 2 AND all way IDs match (so we know that it's the same two-way street)
            elif (len(inn) == len(out) == 2) and \
                 (g.edges[inn[0]]['id'] == g.edges[out[0]]['id']) and \
                 (g.edges[inn[1]]['id'] == g.edges[out[1]]['id']) and \
                    (g.edges[inn[0]]['id'] == g.edges[inn[1]]['id']):
                ie = inn[0]
                for oe in out:
                    if ie[0] != oe[1]:
                        replace_node_with_edge(g,ie,oe,oneway=False)
                        break
                nodes_to_remove.append(node) 
                g.remove_edges_from(inn+out)
#                 node_tl[node] = ie[0] # attach deleted node to node prior   
        
        g.remove_nodes_from(nodes_to_remove)
        
        # stop simplifying if no gains are made
        current = len(g.nodes())
        if last_count <= current:
            break
        else:
            last_count = current
            
    # PART II: run a more lenient iteration that deletes more nodes
    while True: # scary notation! break check at end of while loop (always want it to run at least once)
        nodes_to_remove = []
        for node in g.nodes():
            inn = list(g.in_edges(node))
            out = list(g.out_edges(node))

            # RELAXED CONSTRAINTS: check congruity based on name instead of id
            
            # simplify one way streets by deleting any midpoints regardless of what way they're on
            if (len(inn) == len(out) == 1) and (inn[0][0] != out[0][1]):
                replace_node_with_edge_adv(g,inn[0],out[0],oneway=True)
                nodes_to_remove.append(node)
                g.remove_edges_from(inn+out)
#                 node_tl[node] = inn[0][0] # attach deleted node to node prior

            # simplify two-way: relax prior constraint from ID match to just a 4-way name match while still excluding two-sided road forks
            # this isn't an area where the road explicitly splits into one-way streets
            elif (len(inn) == len(out) == 2) and \
                g.edges[inn[0]]['tags'].get('name') and \
                g.edges[inn[1]]['tags'].get('name') and \
                g.edges[out[0]]['tags'].get('name') and \
                g.edges[out[1]]['tags'].get('name') and \
                (g.edges[inn[0]]['tags']['name'] == g.edges[out[0]]['tags']['name']) and \
                (g.edges[inn[1]]['tags']['name'] == g.edges[out[1]]['tags']['name']) and \
                (g.edges[inn[0]]['tags']['name'] == g.edges[inn[1]]['tags']['name']) and \
                (('oneway' not in g.edges[inn[0]]['tags']) or (g.edges[inn[0]]['tags']['oneway'] != 'yes')) and \
                (('oneway' not in g.edges[inn[1]]['tags']) or (g.edges[inn[1]]['tags']['oneway'] != 'yes')):
                    ie = inn[0]
                    for oe in out:
                        if ie[0] != oe[1]:
                            replace_node_with_edge_adv(g,ie,oe,oneway=False)
                            nodes_to_remove.append(node) 
                            g.remove_edges_from(inn+out)
#                             node_tl[node] = ie[0] # attach deleted node to node prior  
                            break  
        
        g.remove_nodes_from(nodes_to_remove)
        
        # stop simplifying if no gains are made
        current = len(g.nodes())
        if last_count <= current:
            break
        else:
            last_count = current
        
    return g


def limits_left_to_infer(g):
    count = 0
    for edge in g.edges():
        if 'maxspeed' not in g.edges[edge]['tags']:
            count += 1
    return count

def infer_speedlimits(g):
#     g = g.copy()
    # print('Reducing number of edges without speed limit information...')
    last_count = limits_left_to_infer(g)
    while True: # break statement at end of loop
        # keep iterating until we fail to add any more 
        for edge in g.edges():
            if 'maxspeed' not in g.edges[edge]['tags']:
                # search through other nodes to infer a plausible speed by taking the median speedlimit of neighboring edges
                lims = []
                for poss in (list(g.in_edges(edge[0])) + list(g.out_edges(edge[0])) + list(g.in_edges(edge[1])) + list(g.out_edges(edge[1]))):
                    if g.edges[poss]['tags'].get('maxspeed'):
                        lims.append(g.edges[poss]['tags']['maxspeed'])
                if len(lims) > 0:
                    g.edges[edge]['tags']['maxspeed'] = median(lims)
#                     print(g.edges[edge]['maxspeed'])
        
        # break if we haven't been able to infer any more speed limits
        unknowns_left = limits_left_to_infer(g)
        # print(unknowns_left)
        if last_count <= unknowns_left:
            break
        else:
            last_count = unknowns_left
            
    return g

def lanes_left_to_infer(g):
    count = 0
    for edge in g.edges():
        if (g.edges[edge]['tags'].get('lanes',0)) == 0:
            count += 1
    return count

def infer_lanes(g):
    last_count = lanes_left_to_infer(g)

    # ONE-WAY lane max dict
    maxlanes = { 
        'motorway' : 5,
        'trunk' : 4,
        'primary' : 3,
        'secondary' : 2,
        'tertiary' : 1,
        'unclassified' : 1,
#         'residential' : 1,
#         'service' : 1
    }
    
    # print('Reducing number of edges without lane information...')

    while True: # break statement at end of loop
        # keep iterating until we fail to add any more 
        for edge in g.edges():
            if (g.edges[edge]['tags'].get('lanes',0)) == 0:
                # search through other nodes to infer a plausible speed by taking the median lanes of neighboring edges
                lans = []
                for poss in (list(g.in_edges(edge[0])) + list(g.out_edges(edge[0])) + list(g.in_edges(edge[1])) + list(g.out_edges(edge[1]))):
                    if g.edges[poss]['tags'].get('lanes',0) > 0:
                        lans.append(g.edges[poss]['tags']['lanes'])
                if len(lans) > 0:
                    est = median(lans)
                    
                    # sanity check on estimated lanes
                    typ = g.edges[edge]['tags']['highway']
                    bound = 0
                    if typ in maxlanes:
                        bound = maxlanes[typ]
                    # fallback if highway type isn't found, zero out edge
                    if est > bound:
                        est = bound
                    
                    g.edges[edge]['tags']['lanes'] = est
        
        # break if we haven't been able to infer any more speed lanes
        unknowns_left = lanes_left_to_infer(g)
        # print(unknowns_left)
        if last_count <= unknowns_left:
            break
        else:
            last_count = unknowns_left
            
    return g

def estimate_capacity(g):
    
    # capacity dict
    # arterial: 800, local: 400, scaled in between
    capacity = { # veh/hr/ln
        'motorway' : 800,
        'trunk' : 800,
        'primary' : 700,
        'secondary' : 600,
        'tertiary' : 500,
        'unclassified' : 400,
#         'residential' : 400,
#         'service' : 400
    }
    
    for edge in g.edges():
#         if g.edges[edge]['tags']['highway'] in capacity:
        g.edges[edge]['capacity'] = capacity.get(g.edges[edge]['tags']['highway'],0) * g.edges[edge]['tags']['lanes']
#         else:
#             print(g[n1][n2]['tags']['highway'])
#             row['capacity'] = 0

def estimate_fftime(g):
    
    for edge in g.edges():
        g.edges[edge]['fftime'] = g.edges[edge]['length'] / g.edges[edge]['tags']['maxspeed']

def det_coeffs(g):
    for n1,n2,e in g.edges(data=True):
        typ = e['tags'].get('highway')

        # values from a paper by Carlin and Gerry
        g[n1][n2]['b'] = 0.7
        g[n1][n2]['power'] = 0.4

        # if (typ == "motorway") or (typ == "trunk"): # kinda like a 6-lane freeway
        #     # approximated from http://onlinepubs.trb.org/onlinepubs/archive/NotesDocs/appxa.pdf
        #     g[n1][n2]['b'] = 6
        #     g[n1][n2]['power'] = 0.85
        # elif typ == 'primary': # kinda like a 4-lane highway
        #     # see above
        #     g[n1][n2]['b'] = 3
        #     g[n1][n2]['power'] = 0.85
        # else:
        #     # sourced from http://onlinepubs.trb.org/onlinepubs/archive/NotesDocs/appxa.pdf
        #     g[n1][n2]['b'] = 4
        #     g[n1][n2]['power'] = 0.15

def read_osm_and_make_graph(filename):
    nodes, ways = read_osm(filename)
    g = construct_graph(nodes, ways)

    eo = len(g.edges())
    no = len(g.nodes())

    calc_length(g)
    g = simplify_graph(g)
    infer_speedlimits(g)
    infer_lanes(g)
    estimate_capacity(g)
    estimate_fftime(g)
    det_coeffs(g) # TODO: make user-editable

    es = len(g.edges())
    ns = len(g.nodes())

    # find centroid
    mlon = np.mean([g.nodes[n]['lon'] for n in g.nodes()])
    mlat = np.mean([g.nodes[n]['lat'] for n in g.nodes()])

    # clean up graph to save memory
    for edge in g.edges():
        g.edges[edge]['maxspeed'] = g.edges[edge]['tags'].get('maxspeed',0)
        g.edges[edge]['lanes'] = g.edges[edge]['tags'].get('lanes',0)
        g.edges[edge]['name'] = g.edges[edge]['tags'].get('name',0)
        del g.edges[edge]['tags']
        g.edges[edge].pop('uid', None)
    
    # mark not TAZs
    for node in g.nodes():
        g.nodes[node]['taz'] = False

    return g, eo, no, es, ns, mlon, mlat
