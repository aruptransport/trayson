import gzip
import json
import requests
import urllib.parse as urlparse
import networkx as nx
from datetime import datetime
from time import time

def make_requests(api_key, ff_time, am_time, g):

    # test api key
    test = requests.get(
        'https://maps.googleapis.com/maps/api/directions/json?origin=arup+oakland&destination=arup+sf&departure_time=now&key={}'.format(api_key)
    ).json()
    if test['status'] != 'OK':
        raise Exception(test['error_message'])
    elif 'duration_in_traffic' not in test['routes'][0]['legs'][0]:
        raise Exception('Duration in traffic not returned. Suspect bad API key.')

    # start running the requests
    results = []
    error_log = []

    session = requests.session()
    url_raw = 'https://maps.googleapis.com/maps/api/directions/json'
    mode = 'driving'
    model = 'best_guess'

    # make requests
    for i,(n1,n2) in enumerate(g.edges()):

        origin = str(g.nodes[n1]['lat']) + "," + str(g.nodes[n1]['lon'])
        destination = str(g.nodes[n2]['lat']) + "," + str(g.nodes[n2]['lon'])

        # cycle through ampm
        for j,departure_time in enumerate([ff_time, am_time]):

            # track time of day
            ampmstr = 'ff_' if j==0 else 'am_'
            
            # prepare request but don't send it
            params={
                'origin': origin,
                'destination': destination,
                'key': api_key,
                'departure_time': departure_time,
                'mode': mode,
                'model': model
            }
            request = requests.Request('GET', url_raw, params=params).prepare()

            try:
                # actually send request
                response = session.send(request)

                # Get the response
                directions = response.json()

                status = directions["status"]
                if status != "OK":
                    data = {
                        "error" : {
                            "type" : "API",
                            "code" : status
                            },
                        "request" : params
                    }
                    print("API response error: ", status)
                    error_log.append(data)
                    continue

                # log request
                directions['request_data'] = params

                # save results
                results.append(directions)

                # collect travel time
                duration = 0
                for leg in directions['routes'][0]['legs']:
                    duration += leg['duration_in_traffic']['value']
                duration = duration/60**2 # convert to hours
                g[n1][n2][ampmstr+model] = duration

            except Exception as e:
                error_code = str(type(e)) + ': ' + str(e)
                data = {
                    "error" : {
                        "type" : "unknown",
                        "code" : error_code
                    },
                    "request" : request
                }
                error_log.append(data)
                g[n1][n2][ampmstr+model] = 0

    # # calculate timing
    # end = time.time()
    # elapsed_time = end - start
    # time_per_request = elapsed_time / len(api_schedules)
    # print(time_per_request, " time per request")

    # determine filesize
    chunkSize = 500
    # print("Dumping requests locally")
    time_label = (datetime.fromtimestamp(int(time())).strftime('%Y-%m-%d_%H-%M'))
    for i in range(0, len(results), chunkSize):
        with gzip.open('logs/gmaps_results/api_responses_' + time_label + "_" + str((i//chunkSize)+1) + '.json.gz', 'wt', encoding="utf8") as outfile:
            json.dump(results[i:i+chunkSize], outfile, indent =2)

    with gzip.open("logs/gmaps_errors/error_log_" + time_label + ".json.gz", 'wt', encoding="utf8") as outfile:
        json.dump(error_log,outfile,indent=2)

    # value = datetime.fromtimestamp(int(time.time()))
    # time_label = (value.strftime('%Y-%m-%d_%H-%M'))
    # print("API call completed: ", time_label)

    return g
