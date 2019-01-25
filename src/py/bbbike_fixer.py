import xml.etree.ElementTree
from time import time
from datetime import datetime
import sys

# run IFF you're converting an extracted OSM XML downloaded from bbbike for use by osmread

# def bbbike_fixer(in_file):

#     # Open original file
#     t = xml.etree.ElementTree.fromstring(in_file)

#     #give time
#     value = datetime.fromtimestamp(int(time()))
#     time_label = (value.strftime('%Y-%m-%dT%H:%M:%SZ'))

#     for child in t:
#         child.attrib['changeset'] = '1'
#         child.attrib['timestamp'] = time_label
#     return xml.etree.ElementTree.tostring(t) # change from default us-ascii to utf-8?

def bbbike_fixer(in_filename, out_filename):

    # Open original file
    t = xml.etree.ElementTree.parse(in_filename)

    #give time
    value = datetime.fromtimestamp(int(time()))
    time_label = (value.strftime('%Y-%m-%dT%H:%M:%SZ'))

    count = 0
    for child in t.getroot():
        child.attrib['changeset'] = '1'
        child.attrib['timestamp'] = time_label
    t.write(out_filename)
