import React from "react";
import { scaleSequential } from 'd3-scale';
import { interpolateRainbow } from 'd3-scale-chromatic';

// NOTE: TAZ nodes are 1-indexed, while in react internal memory they are 0-indexed.
//       As such, nodes not associated with a TAZ are indexed with a this.state.tazAssociated of -1.
//       Nodes associated with TAZ #n is stored as this.state.tazAssociated n-1 (so TAZ #1 => 0), the internal array index. 
export default class FeatureTooltip extends React.Component {
    constructor(props) {
        super(props);

        // change properties displayed depending on feature type and state
        if (props.layer.feature.geometry.type === 'Point') {
            this.state = {
                type: 'Point',
                id: props.layer.feature.id,
                lon: props.layer.feature.geometry.coordinates[0],
                lat: props.layer.feature.geometry.coordinates[1],
                taz: props.layer.feature.properties.taz
            };
            if ((this.props.state === 3) && (!this.state.taz)) { // identify if associated this node is associated with any TAZs
                this.state.tazAssociated = -1;
                for (let i=0; i<this.props.tazList.length; i++) {
                    if (this.props.tazList[i].indexOf(this.state.id) > -1) {
                        this.state.tazAssociated = i;
                        break;
                    }
                }
            }
        } else if (props.layer.feature.geometry.type === 'LineString') {
            // TODO: Consider keeping road type field to allow for type changes.
            //       In initial network construction, (lanes * per lane capacity dependent of road class) is used to calculate the total capacity.
            //       However, road class is not preserved in the transition from OSM, which means changing lane count in this tooltip won't affect capacity.
            //       "lanes" is visualized on the network graph as edge width, but "capacity" is the actual value used in trip assignment.
            this.state = {
                type: 'LineString', // don't show
                name: props.layer.feature.properties.name, // show
                nodes: props.layer.feature.id, // show
                coordinates: props.layer.feature.geometry.coordinates, // show
                capacity: props.layer.feature.properties.capacity, // show, editable but only by proxy as a function of "lanes"
                length: props.layer.feature.properties.length, // show
                lanes: props.layer.feature.properties.lanes, // expose for editing
                maxspeed: props.layer.feature.properties.maxspeed, // expose for editing
                b: props.layer.feature.properties.b, // expose for editing
                power: props.layer.feature.properties.power, // expose for editing
                // id: props.layer.feature.properties.id, // unused and unnecessary. networkx will assign a new one when reconstructing
                fftime: props.layer.feature.properties.fftime, // don't show. calculated fftime, different from API. function of "maxspeed" and "length"
            };
            if (props.state >= 2) {
                this.state.am_best_guess = props.layer.feature.properties.am_best_guess; // show
                this.state.api_ratio = props.layer.feature.properties.api_ratio; // show
                this.state.ff_best_guess = props.layer.feature.properties.ff_best_guess; // show
            }
            if (props.state >= 6) {
                this.state.delta = props.layer.feature.properties.delta; // show
                this.state.fixed_flow = props.layer.feature.properties.fixed_flow; // show
                this.state.flow = props.layer.feature.properties.flow; // show
                this.state.fw_ratio = props.layer.feature.properties.fw_ratio; // show
                this.state.new_flow = props.layer.feature.properties.new_flow; // show
                this.state.proj_ttime = props.layer.feature.properties.proj_ttime; // show
            }
        } // shouldn't have any other types

        this.state.changed = false;

        this.changeTAZassociated = this.changeTAZassociated.bind(this);
        this.changeLanes = this.changeLanes.bind(this);
        this.changeMaxspeed = this.changeMaxspeed.bind(this);
        this.changeB = this.changeB.bind(this);
        this.changePower = this.changePower.bind(this);
        this.pushChanges = this.pushChanges.bind(this);
    }

    // assign node to TAZ number for TAZ construction and propogate change upward
    changeTAZassociated(e) {
        const newTAZassociated = Number(e.target.value);

        // the colorscale created by d3-scale-chromatic should be deterministic
        this.props.layer.setStyle({
            fillColor: (newTAZassociated === -1) ? ('gray') : (
                scaleSequential(interpolateRainbow)
                    .domain([0, this.props.ntazs])
                    (newTAZassociated)
            )
        })

        if (this.state.tazAssociated !== -1) { // already associated with a TAZ, need to remove and replace
            this.props.removeNodeFromSetInTAZlist(this.state.tazAssociated, this.state.id);
        }

        this.setState({
            tazAssociated: newTAZassociated
        }, () => {
            if (newTAZassociated !== -1) { // associate with new TAZ unless 
                this.props.addNodeToSetInTAZlist(newTAZassociated, this.state.id);
            }
        });
    }

    // TODO: unintuitive behavior on numerical inputs
    //       (behavior goes wonky when input box is blank, current workaround is to prevent it from ever being blank)
    //       see https://stackoverflow.com/questions/43687964/only-numbers-input-number-in-react
    changeLanes(e) {
        const newLanes = (e.target.value !== "") ? (Number(e.target.value)) : (1);
        this.setState({
            lanes: newLanes,
            capacity: (newLanes/this.state.lanes) * this.state.capacity,
            changed: true
        });
    }

    changeMaxspeed(e) {
        this.setState({
            maxspeed: (e.target.value !== "") ? (Number(e.target.value)) : (0),
            changed: true
        });
    }

    changeB(e) {
        this.setState({
            b: (e.target.value !== "") ? (Number(e.target.value)) : (0),
            changed: true
        });
    }

    changePower(e) {
        this.setState({
            power: (e.target.value !== "") ? (Number(e.target.value)) : (0),
            changed: true
        });
    }

    // propogate feature property edit on UI confirmation and propogate upward
    pushChanges(e) {
        e.preventDefault();

        // wrap state into a new geojson feature and send back
        let edited = {};
        if (this.props.layer.feature.geometry.type === 'Point') {
            edited = this.props.layer.feature; // not allowed to change anything yet
        } else if (this.props.layer.feature.geometry.type === 'LineString') {
            edited = {
                type: "Feature",
                id: this.state.nodes,
                geometry: {
                    coordinates: this.state.coordinates,
                    type: "LineString"
                },
                properties: { //TODO: change
                    name: this.state.name, // show
                    capacity: this.state.capacity, // show
                    length: this.state.length, // show
                    lanes: this.state.lanes, // show
                    maxspeed: this.state.maxspeed, // show
                    b: this.state.b, // expose for editing
                    power: this.state.power, // expose for editing
                    fftime: this.state.fftime, // don't show. calculated fftime, different from API
                }
            }            
            if (this.props.state >= 2) {
                edited.properties.am_best_guess = this.state.am_best_guess; // no editing?
                edited.properties.api_ratio = this.state.api_ratio; // no editing
                edited.properties.ff_best_guess = this.state.ff_best_guess;
            }
            if (this.props.state >= 6) {
                edited.properties.delta = this.state.delta;
                edited.properties.fixed_flow = this.state.fixed_flow;
                edited.properties.flow = this.state.flow;
                edited.properties.fw_ratio = this.state.fw_ratio;
                edited.properties.new_flow = this.state.new_flow;
                edited.properties.proj_ttime = this.state.proj_ttime;
            }
        }

        this.props.onEdit(edited);

        this.setState({ changed: false });
    }

    // display available feature information, editables, and TAZ assigning tool depending on state
    render() {
        const editingDisabled = (this.props.state === 5) || (this.props.state === 7)

        return (
            <div class="ui basic segment">
                {(editingDisabled) ? (<p>Editing disabled pending trip assignment</p>) : (null)}
                <form onSubmit={this.pushChanges} class="ui form">
                    {(this.state.type === 'Point') ? (
                        <div>
                            <h3 class="ui dividing header">
                                Node Properties
                            </h3>
                            <div class="two fields">
                                <div class="disabled field">
                                    <label>ID</label>
                                    <input 
                                        type="text" 
                                        readOnly={true}
                                        value={this.state.id} 
                                    />
                                </div>
                                <div class="disabled field">
                                    <label>Name</label>
                                    <input 
                                        type="text" 
                                        readOnly={true}
                                        value={this.state.name} 
                                    />
                                </div>
                            </div>
                            <div class="two fields">
                                <div class="disabled field">
                                    <label>Latitude</label>
                                    <input 
                                        type="number" 
                                        readOnly={true}
                                        value={this.state.lat} 
                                    />
                                </div>
                                <div class="disabled field">
                                    <label>Longitude</label>
                                    <input 
                                        type="number" 
                                        readOnly={true}
                                        value={this.state.lon} 
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <h3 class="ui dividing header">
                                Link Properties
                            </h3>
                            <div class="two fields">
                                <div class="disabled field">
                                    <label>Nodes</label>
                                    <input 
                                        type="text" 
                                        readOnly={true}
                                        value={this.state.nodes} 
                                    />
                                </div>
                                <div class="disabled field">
                                    <label>Name</label>
                                    <input 
                                        type="text" 
                                        readOnly={true}
                                        value={this.state.name} 
                                    />
                                </div>
                            </div>
                            <div class="two fields">
                                <div class="disabled field">
                                    <label>Length (mi)</label>
                                    <input 
                                        type="number" 
                                        readOnly={true}
                                        value={this.state.length} 
                                    />
                                </div>
                                <div class="disabled field">
                                    <label>Capacity (veh/mi/hr)</label>
                                    <input 
                                        type="number" 
                                        readOnly={true}
                                        value={this.state.capacity} 
                                    />
                                </div>
                            </div>
                            <div class="two fields">
                                <div class="field">
                                    <label>Lanes</label>
                                    <input onChange={this.changeLanes}
                                        type="number"
                                        min="1"
                                        step="any"
                                        readOnly={editingDisabled}
                                        value={this.state.lanes} 
                                    />
                                </div>
                                <div class="field">
                                    <label>Speed limit (mph)</label>
                                    <input onChange={this.changeMaxspeed}
                                        type="number"
                                        min="0"
                                        step="1"
                                        readOnly={editingDisabled}
                                        value={this.state.maxspeed} 
                                    />
                                </div>
                            </div>
                            {(this.props.state >= 2) ? (
                                <div>
                                    <h3 class="ui dividing header">
                                        Travel Time Retrieval
                                    </h3>
                                    <div class="three fields">
                                        <div class="disabled field">
                                            <label>Free flow 2 A.M. Travel Time (min) </label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.ff_best_guess * 60} 
                                            />
                                        </div>
                                        <div class="disabled field">
                                            <label>Congested 8 A.M. Travel Time (min)</label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.am_best_guess * 60} 
                                            />
                                        </div>
                                        <div class="disabled field">
                                            <label>Congested/Freeflow TT Ratio</label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.api_ratio} 
                                            />
                                        </div>                             
                                    </div>
                                </div>
                            ): (null)}
                            {(this.props.state >= 6) ? (
                                <div>
                                    <h3 class="ui dividing header">
                                        Traffic Assignment
                                    </h3>
                                    <div class="two fields">
                                        <div class="field">
                                            <label>Coefficient (BPR formula)</label>
                                            <input onChange={this.changeB}
                                                type="number"
                                                min="0"
                                                step="any"
                                                readOnly={editingDisabled}
                                                value={this.state.b} 
                                            />
                                        </div>
                                        <div class="field">
                                            <label>Power (BPR formula)</label>
                                            <input onChange={this.changePower}
                                                type="number"
                                                min="0"
                                                step="any"
                                                readOnly={editingDisabled}
                                                value={this.state.power} 
                                            />
                                        </div>
                                    </div>
                                    <div class="three fields">
                                        <div class="disabled field">
                                            <label>Existing Volume (veh)</label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.fixed_flow} 
                                            />
                                        </div>
                                        <div class="disabled field">
                                            <label>Assigned Volume (veh)</label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.new_flow} 
                                            />
                                        </div>
                                        <div class="disabled field">
                                            <label>Total Volume (veh)</label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.flow} 
                                            />
                                        </div>
                                    </div>
                                    <div class="three fields">
                                        <div class="disabled field">
                                            <label>Change in Volume/Capacity</label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.delta} 
                                            />
                                        </div>
                                    </div>
                                    <div class="three fields">
                                        <div class="disabled field">
                                            <label>New TT</label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.proj_ttime} 
                                            />
                                        </div>
                                        <div class="disabled field">
                                            <label>New Congested/Freeflow TT Ratio</label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.fw_ratio} 
                                            />
                                        </div>
                                        <div class="disabled field">
                                            <label>Change in TT Ratio</label>
                                            <input 
                                                type="number" 
                                                readOnly={true}
                                                value={this.state.fw_ratio - this.state.api_ratio} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (null)}
                        </div>
                    )}
                    {(this.state.changed) ? (
                        <div class="field">
                            <input type='submit' value='Confirm Changes' />
                        </div>
                    ) : (null)}
                </form>
                {(this.props.state === 3) ? (
                    ('tazAssociated' in this.state) ? (
                        <div class="ui form">
                            <div class="field">
                                <label>Associated Travel Zone</label>
                                <select onChange={this.changeTAZassociated} value={this.state.tazAssociated}>
                                    <option value={-1}>None</option>
                                    {
                                        // index 0 => TAZ node 1, etc
                                        this.props.tazList.map(
                                            (item, index) => {
                                                return (
                                                    <option 
                                                        key={index} 
                                                        value={index}
                                                    >{index+1}</option>
                                                )
                                            }
                                        )
                                    }
                                </select>
                            </div>
                        </div>
                    ) : (null)
                ) : (null)}
            </div>
        )
    }
}