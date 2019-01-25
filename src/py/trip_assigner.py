import pandas as pd
from os import system, remove

NET_FILENAME = "tmp/net.csv"
NET_METADATA_FILENAME = "tmp/net_metadata.csv"
TRIP_METADATA_FILENAME = "tmp/trip_metadata.csv"
TRIP_FILENAME = "tmp/trips.csv"
OUT_FILENAME = "tmp/TA_results.csv"

def dump_network_as_csvs(g, ntazs):
    df = pd.DataFrame(columns=['tail','head','capacity','length','fftime','b','power','speedlimit','toll','type','am','base'])

    # iterate through all edges
    node_counter = ntazs
    edge_counter = 0
    node_to_id = {}
    id_to_node = {}
    for i in range(1, ntazs+1):
        node_to_id[i] = i
        id_to_node[i] = i
    for n1, n2 in g.edges():

        # reindex nodes
        if n1 not in node_to_id:
            node_counter += 1
            node_to_id[n1] = node_counter
            id_to_node[node_counter] = n1
        if n2 not in node_to_id:
            node_counter += 1
            node_to_id[n2] = node_counter
            id_to_node[node_counter] = n2
  
        row = {}
        row['tail'] = node_to_id[n1]
        row['head'] = node_to_id[n2]
        row['capacity'] = g[n1][n2]['capacity']
        row['length'] = g[n1][n2]['length']
        row['speedlimit'] = g[n1][n2]['maxspeed']
        row['fftime'] = g[n1][n2]['fftime']
        row['b'] = g[n1][n2]['b']
        row['power'] = g[n1][n2]['power']
        
        row['toll'] =  0 # see osm fee, payment, toll, charge tags. assuming 0 because no transbay bridges are included in the bounding box.
        row['type'] =  1 # not making a distinction for now. if we want to, try https://github.com/bstabler/TransportationNetworks/blob/45c79942bfcd007bce644b825b7f4571355d33a0/Philadelphia/README.md
        
        row['am'] = g[n1][n2]['am_best_guess']
        row['base'] = g[n1][n2]['ff_best_guess']
        
        df.loc[edge_counter] = row
        edge_counter += 1

    # ensure ints
    df['tail'] = df['tail'].astype(int)
    df['head'] = df['head'].astype(int)
    
    # csv form
    # main body (edges)
    df.to_csv('tmp/net.csv', index=False)
    # header/metadata
    with open('tmp/net_metadata.csv', 'w') as o:
        o.write('<NUMBER OF ZONES>,{}\n<NUMBER OF NODES>,{}\n<NUMBER OF LINKS>,{}\n'.format(ntazs, node_counter, edge_counter))

    return id_to_node

def dump_trips_as_csvs(trip_table, ntazs, total_trips):
    pd.DataFrame(trip_table, columns=list(range(len(trip_table)))).to_csv('tmp/trips.csv')
    with open('tmp/trip_metadata.csv', 'w') as o:
        o.write('<NUMBER OF ZONES>,{}\n<TOTAL OD FLOW>,{}\n'.format(ntazs, total_trips))

def run_trip_assignment(g, ntazs, trip_table, total_trips):
    id_to_node = dump_network_as_csvs(g, ntazs)
    dump_trips_as_csvs(trip_table, ntazs, total_trips)   
    
    system('./julia-0.6/bin/julia src/jl/traffic_assignment.jl {} {} {} {} {}'.format(
        NET_FILENAME, NET_METADATA_FILENAME, TRIP_METADATA_FILENAME, TRIP_FILENAME, OUT_FILENAME))

    remove(NET_FILENAME)
    remove(NET_METADATA_FILENAME)
    remove(TRIP_METADATA_FILENAME)
    remove(TRIP_FILENAME)

    dfres = pd.read_csv(OUT_FILENAME)
    remove(OUT_FILENAME)
    dfres['tail'] = dfres['tail'].apply(lambda x: id_to_node[x])
    dfres['head'] = dfres['head'].apply(lambda x: id_to_node[x])

    for i,row in dfres.iterrows():
        edge = g[int(row['tail'])][int(row['head'])]
        edge['proj_ttime'] = row['travel_time']
        edge['new_flow'] = row['xk']
        edge['fixed_flow'] = row['fixed_flow']   
        edge['flow'] = row['xk'] + row['fixed_flow']
        
        if edge['ff_best_guess'] == 0:
            edge['fw_ratio'] = 1
        else:
            edge['fw_ratio'] = edge['proj_ttime']/edge['ff_best_guess']
        if edge['fw_ratio'] < 1:
            edge['fw_ratio'] = 1

        edge["delta"] = edge["new_flow"]/edge["capacity"]

    return g
