from flask import Flask, redirect, url_for, escape, request, jsonify, abort, send_file, Response
from werkzeug.utils import secure_filename
import os
import shutil
from io import BytesIO

import networkx as nx
import numpy as np

from src.py.bbbike_fixer import bbbike_fixer
from src.py.osm_reader import read_osm_and_make_graph
from src.py.nx_geojson import nx_to_geojson, geojson_to_nx
from src.py.api_requester import make_requests
from src.py.taz_creator import add_TAZs_to_network
from src.py.trip_assigner import run_trip_assignment

app = Flask(__name__, static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024 # limit upload sizes to 1gb

# generate secret key
# TODO: change for production
import binascii
app.secret_key = binascii.hexlify(os.urandom(24))
UPLOAD_FOLDER = 'tmp'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# serve static site
@app.route('/')
def index():
    return app.send_static_file("index.html")

# convenience function to verify approved file type extensions
def allowed_file(filename, allowed_extensions):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in allowed_extensions

# upload OSM file, turn into network graph, and return as JSON to display in frontend.
@app.route('/_upload_osm', methods=['POST'])
def upload_osm():
    if 'file' not in request.files:
        print('empty osm upload')
        abort(400)
    file = request.files['file']
    if (not file) or file.filename == '' or (not allowed_file(file.filename, set(['osm']))):
        print('osm extension is bad')
        abort(400)
    else:
        filename = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(file.filename))
        file.save(filename)
        
        try:
            g, eo, no, es, ns, mlon, mlat = read_osm_and_make_graph(filename)
        except KeyError as e:
            if str(e) != '\'changeset\'':
                raise
            else:
                bbbike_fixer(filename, filename)
                g, eo, no, es, ns, mlon, mlat = read_osm_and_make_graph(filename)
        os.remove(filename)

        return jsonify({
            'edges_original': eo,
            'nodes_original': no,
            'edges_simplified': es,
            'nodes_simplified': ns,
            'mean_longitude': mlon,
            'mean_latitude': mlat,
            'network': nx_to_geojson(g)
        })

    abort(400)

# given api key and date, get and return network with free flow 2am traffic times and 8am congested times.
@app.route('/_get_traffic', methods=['POST'])
def get_traffic():
    payload = request.get_json()

    try:
        g = make_requests(payload['api_key'], payload['ff'], payload['am'], geojson_to_nx(payload['nw']))
    except Exception as e:
        print(e)
        abort(400)

    # calculate api ratio
    for n1,n2,dat in g.edges(data=True):
        g[n1][n2]['api_ratio'] = (dat['am_best_guess']/dat['ff_best_guess']) if ((dat['am_best_guess'] > 0) and (dat['ff_best_guess'] > 0)) else 1
    
    return jsonify(nx_to_geojson(g))

# add TAZs to network by attaching to nodes specified and return result.
@app.route('/_create_tazs', methods=['POST'])
def create_tazs():
    payload = request.get_json()

    return jsonify(nx_to_geojson(add_TAZs_to_network(geojson_to_nx(payload['nw']), payload['tazList'])))

# upload trip table, check that it's square, and return as JSON.
@app.route('/_upload_trip_table', methods=['POST'])
def upload_trips():
    # check if the post request has the file part
    if 'file' not in request.files:
        abort(400)
    file = request.files['file']
    if (not file) or file.filename == '' or (not allowed_file(file.filename, set(['csv']))):
        abort(400)
    else:
        filename = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(file.filename))
        file.save(filename)
        
        try:
            tt = np.genfromtxt(filename, delimiter=',')
            assert tt.shape[0] == tt.shape[1]
            assert tt.shape[0] > 1
        except AssertionError:
            abort(400)
        os.remove(filename)

        return jsonify({
            'trip_table': tt.tolist(),
            'total_trips': tt.sum().sum(),
            'ntazs': tt.shape[0]
        })

    abort(400)

# take in network and trip table as JSONs, run traffic assignment, and return resulting network.
@app.route('/_do_assignment', methods=['POST'])
def do_assignment():
    payload = request.get_json()

    return jsonify(nx_to_geojson(run_trip_assignment(geojson_to_nx(payload['nw']), payload['ntazs'], payload['tt'], payload['tot'])))
