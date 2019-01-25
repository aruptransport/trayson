import React from "react";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { max, min } from 'd3';
import { scaleSequential } from 'd3-scale';
import { interpolateRdYlGn, interpolateBlues, interpolateReds, interpolateViridis, interpolateRainbow } from 'd3-scale-chromatic';

import FeatureTooltip from './FeatureTooltip';

export default class NetVisualizer extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            bmap: null,
            gjlayer: null,
            editable: false,
            colorby: null,
            layerBeingEdited: null,
        };

        this.calcNodeRadius = this.calcNodeRadius.bind(this);
        this.recolorEdgesOnSelect = this.recolorEdgesOnSelect.bind(this);
        this.recolorEdges = this.recolorEdges.bind(this);
        this.recolorNetwork = this.recolorNetwork.bind(this);
        this.editFeature = this.editFeature.bind(this);
    }

    calcNodeRadius(isTAZ, currentZoomLevel) {
        return ((isTAZ) ? 3 : 2)*(currentZoomLevel/13)**4
    }

    // recolor edges based on user UI selection
    recolorEdgesOnSelect(e) {
        this.recolorEdges(e.target.value);
    }

    // recolor edges (either based on user UI selection or when a scale needs to be recalculated)
    recolorEdges(coloring) {
        this.state.bmap.removeLayer(this.state.gjlayer);

        const colorby = (coloring === "") ? (null) : (coloring);

        this.setState({
            colorby: colorby,
            gjlayer: this.recolorNetwork(this.state.bmap, colorby)
        });
    }

    // (re)draw geojson based on selected coloring
    // TODO: hide nodes when looking at network colorings where color matters / add a view that unhides the nodes
    recolorNetwork(bmap, colorby) {
        let scale;
        if (colorby === 'lanes') {
            // // variable lane coloring
            // const vals = [];
            // for (let ft of this.props.network.features) {
            //     if (ft.geometry.type === 'LineString') {
            //         vals.push(ft.properties.lanes);
            //     }
            // }
            // scale = scaleSequential(interpolateViridis)
            //     .domain([min(vals), max(vals)]);

            // fixed lane coloring
            scale = scaleSequential(interpolateViridis)
                .domain([0, 10])
                .clamp(true);
        } else if ((colorby === 'api_ratio') || (colorby === 'fw_ratio')) {
            scale = scaleSequential(interpolateRdYlGn)
                .domain([1.5, 1]) // invert since we want to go from red to green
                .clamp(true);
        } else if ((colorby === 'fixed_flow') || (colorby === 'new_flow') || (colorby === 'flow')) {
            const vals = [];
            for (let ft of this.props.network.features) {
                if (ft.geometry.type === 'LineString') {
                    vals.push(ft.properties[colorby]);
                }
            }
            // TODO: consider fixing volume coloring to a set domain
            scale = scaleSequential(interpolateBlues)
                .domain([0, max(vals)])
                .clamp(true);
        } else if (colorby === 'delta') {
            scale = scaleSequential(interpolateReds)
                .domain([0, 0.5])
                .clamp(true);
        } else {
            scale = () => {return 'black'};
        }

        return L.geoJSON(this.props.network, {
            filter: function(feature, layer) {
                return (feature.geometry.type === 'LineString' || feature.geometry.type === 'Point')
            }, // shouldn't have anything else

            style: function(feature) {
                if (feature.geometry.type === 'LineString') {
                    return {
                        weight: feature.properties.lanes*2,
                        opacity: 0.7,
                        color: (colorby === null) ? ('gray') : (scale(feature.properties[colorby]))
                    };
                } else if (feature.geometry.type === 'Point') {
                    // used so color persists if you load a state in the middle of TAZ creation
                    let colorIfTAZassociated = 'gray'; // default node color
                    if (this.props.tazList !== null) {                        
                        for (let i=0; i<this.props.tazList.length; i++) {
                            if (this.props.tazList[i].includes(feature.id)) {
                                colorIfTAZassociated = scaleSequential(interpolateRainbow)
                                                        .domain([0, this.props.ntazs])
                                                        (i);
                            }
                        }
                    }

                    return {
                        fillColor: (feature.properties.taz ? 'magenta' : colorIfTAZassociated),
                        radius: this.calcNodeRadius(feature.properties.taz, bmap.getZoom()),
                        opacity: 0,
                        fillOpacity: 0.8,
                        zIndex: 1000
                    };
                } else {
                    return null;
                }
            }.bind(this),

            pointToLayer: function(feature, latlng) {
                if (feature.geometry.type === 'Point') {
                    // attach nodes to elevated plane that always keeps them above edges
                    return L.circleMarker(latlng, {
                        pane: "nodePane"
                    });
                } else {
                    // TODO: two way streets decomposed into two one-way streets are drawn on top each other, making one of them unclickable.
                    //       consider changing the shape of one of them so that they don't overlap?
                    return L.circleMarker(latlng);
                }
            },

            onEachFeature: function(feature, layer) {
                // label TAZ nodes by number
                if ((feature.geometry.type === 'Point') && (feature.properties.taz)){
                    layer.bindTooltip(String(feature.id), {
                        permanent: true,
                        opacity: 0.8
                    });
                }
                // make feature editor appear on click
                layer.on('click', function(e) {
                    this.setState({ layerBeingEdited: e.target });
                }.bind(this));
            }.bind(this)
        }).addTo(bmap);
    }

    // redraw network when user edits a property, and pass that propert edit up to the network source of truth in App.jsx
    editFeature(editedFeature) {
        this.state.gjlayer.removeLayer(this.state.layerBeingEdited);
        this.state.gjlayer.addData(editedFeature);
        this.props.updateNetwork(this.state.gjlayer.toGeoJSON());
        // edge recolor lags unless wrapped in a setState for some reason
        // recolor edges after editing in case the edit changes the min or max and therefore the colorscale for the current edge coloring
        // set layerBeingEdited to null because during editing the feature is effectively deleted and recreated, so the old pointer is broken
        // (and i can't figure out how to find the new version that was just drawn)
        this.setState({layerBeingEdited: null}, () => {this.recolorEdges(this.state.colorby);});
    };

    // place leaflet box and draw network for the first time
    componentDidMount() {
        const bmap = L.map('map').setView([this.props.mlat, this.props.mlon], 13);
        L.tileLayer('https://korona.geog.uni-heidelberg.de/tiles/roadsg/x={x}&y={y}&z={z}', {
            maxZoom: 18,
            attribution: 'Imagery from <a href="http://giscience.uni-hd.de/">GIScience Research Group @ University of Heidelberg</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(bmap);
        // create a pane to attach nodes to so we can keep them above edges
        bmap.createPane("nodePane").style.zIndex = 1000;
        bmap.on('zoomend', function() {
            if (this.state.gjlayer !== null) {
                const scaler = (bmap.getZoom()/13)**4;
                this.state.gjlayer.eachLayer(function(layer) {
                    if (layer.feature.geometry.type === 'Point') {
                        layer.setStyle({ radius: this.calcNodeRadius(layer.feature.properties.taz, bmap.getZoom()) });
                    }
                }.bind(this));
            }            
        }.bind(this));

        this.setState({
            bmap: bmap,
            gjlayer: this.recolorNetwork(bmap, null)
        });
    }

    // switch active edge coloring to display the results of polling the traffic API or doing trip assignment and close tooltip if active
    componentDidUpdate(prevProps) {
        // just got API requests
        if ((prevProps.state !== 2) && (this.props.state == 2)) {
            this.recolorEdges("api_ratio");
        }

        // just did trip assignment for the first time
        if (((prevProps.state == 5) || (prevProps.state == 7)) && (this.props.state == 6)) {
            this.recolorEdges("fw_ratio");
        }

        if (prevProps.state !== this.props.state) {
            this.setState({
                layerBeingEdited: null
            });
        }
    }

    // provide coloring options only after the relevant fields have been retrieved
    render() {
        return (<div>
            <div class="ui blue top attached secondary segment"><strong>Network</strong></div>
            <div class="ui bottom attached segment">
                <form class="ui form">
                    <div class="field">
                        <label>Edge Color</label>
                        <select class="ui fluid dropdown" onChange={this.recolorEdgesOnSelect} value={(this.state.colorby === null) ? ("") : (this.state.colorby)}>
                            <option value=""></option>
                            <option value="lanes">Lanes</option>
                            {(this.props.state >= 2) ? (
                                <option value="api_ratio">Congested/free flow travel time ratio by Google Maps traffic API</option>
                            ) : (null)}
                            {(this.props.state >= 6) ? (
                                <option value="fw_ratio">Congested/free flow travel time ratio after new trip assignment</option>
                            ) : (null)}
                            {(this.props.state >= 6) ? (
                                <option value="fixed_flow">Traffic volume before trip assignment</option>
                            ) : (null)}
                            {(this.props.state >= 6) ? (
                                <option value="new_flow">Trip allocation volume</option>
                            ) : (null)}
                            {(this.props.state >= 6) ? (
                                <option value="flow">Total traffic volume after trip assignment</option>
                            ) : (null)}
                            {(this.props.state >= 6) ? (
                                <option value="delta">Volume over capacity delta</option>
                            ) : (null)}
                        </select>
                    </div>
                </form>
                <div id='map' />
                {(this.state.layerBeingEdited !== null) ? (
                    <FeatureTooltip
                        state = {this.props.state} 
                        layer = {this.state.layerBeingEdited}
                        // force re-render when feature changes or state changes
                        key = {String(this.state.layerBeingEdited.feature.id) + this.props.state} 
                        onEdit = {this.editFeature}
                        
                        tazList = {this.props.tazList} 
                        ntazs = {this.props.ntazs}
                        addNodeToSetInTAZlist = {this.props.addNodeToSetInTAZlist}
                        removeNodeFromSetInTAZlist = {this.props.removeNodeFromSetInTAZlist}
                    />
                ) : (null)}
                </div>
            </div>
            )
    }
}
