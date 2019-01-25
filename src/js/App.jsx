import React from "react";
import update from 'immutability-helper';

import Upload from './Upload';
import NetVisualizer from './NetVisualizer';
import NetExporter from './NetExporter';
import TrafficGetter from './TrafficGetter';
import TAZstarter from './TAZstarter';
import TAZcreator from './TAZcreator';
import TripTableReader from './TripTableReader';
import TripAssigner from './TripAssigner';

export default class App extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            
            // tracks what stage the app is on
            state: 0, 
            
            // tracks simplification results
            eo: 0,
            no: 0,
            es: 0,
            ns: 0,

            // centers default leaflet view
            mlon: 0.0,
            mlat: 0.0,

            // holds road network geojson
            network: null,
            network_api_only: null,

            // used for trip assignment
            ntazs: 0,
            tazList: null,
            tripTable: null,
            totalTrips: 0,
            incomingTripTable: null,
        };
      
        this.handleOSMupload = this.handleOSMupload.bind(this);
        this.handleJSONupload = this.handleJSONupload.bind(this);
        this.handleAPIrequests = this.handleAPIrequests.bind(this);
        this.updateNetwork = this.updateNetwork.bind(this);
        this.updateNumTAZs = this.updateNumTAZs.bind(this);
        this.addNodeToSetInTAZlist = this.addNodeToSetInTAZlist.bind(this);
        this.removeNodeFromSetInTAZlist = this.removeNodeFromSetInTAZlist.bind(this);
        this.setTAZs = this.setTAZs.bind(this);
        this.handleTripTable = this.handleTripTable.bind(this);
        this.scrapTripTable = this.scrapTripTable.bind(this);
        this.handleTripAssignment = this.handleTripAssignment.bind(this);
        this.resetToAPInetwork = this.resetToAPInetwork.bind(this);
    }

    handleOSMupload(rs) {
        this.setState({
            state: 1,
            eo: rs.edges_original,
            no: rs.nodes_original,
            es: rs.edges_simplified,
            ns: rs.nodes_simplified,
            mlon: rs.mean_longitude,
            mlat: rs.mean_latitude,
            network: rs.network
        });
    }

    handleJSONupload(rs) {
        this.setState(rs);
    }

    handleAPIrequests(nw) {
        this.setState({
            state: 2,
            network: nw,
            network_api_only: JSON.parse(JSON.stringify(nw))
            // deep copy network (which was provided as text by the server API to begin with) to allow for state reset
        });
    }

    updateNetwork(newNet) {
        this.setState({
            network: newNet
        });
    }

    updateNumTAZs(newTAZnum) {
        const tazList = new Array(newTAZnum);
        for (let i=0; i<newTAZnum; i++) {
            tazList[i] = new Array();
        }
        this.setState({
            state: 3,
            ntazs: newTAZnum,
            tazList: tazList
        });
    }

    addNodeToSetInTAZlist(itaz, nodeID) {
        this.setState({
            tazList: update(this.state.tazList, {
                [itaz]: {$push: [nodeID] }
            })
        });
    }

    removeNodeFromSetInTAZlist(itaz, nodeID) {
        this.setState({
            tazList: update(this.state.tazList, {
                [itaz]: {$splice: [[this.state.tazList[itaz].indexOf(nodeID), 1]] }
            })
        });
    }

    setTAZs(nw) {
        this.setState({
            state: 4,
            tazList: null,
            network: nw
        });
    }

    handleTripTable(rs) {
        this.setState({
            state: ((this.state.state === 4) ? 5 : 7), // first time trip table or not
            incomingTripTable: rs.trip_table,
            totalTrips: rs.total_trips
        });
    }

    scrapTripTable() {
        this.setState({
            state: ((this.state.state === 5) ? 4 : 6), // first time trip table or not
            incomingTripTable: null,
            totalTrips: 0
        })
    }

    handleTripAssignment(rs) {
        this.setState({
            state: 6,
            network: rs,
            tripTable: this.state.incomingTripTable,
            incomingTripTable: null
        })
    }

    resetToAPInetwork() {
        this.setState({
            state: 2,
            network: this.state.network_api_only,
            tripTable: null,
            incomingTripTable: null,
            totalTrips: 0,
            ntazs: 0,
            tazList: null,

            // make sure to reset any state created after api selection (e.g. TAZs)
        });
    }
  
    render() {
        return (
            <div>
                <div class = "ui clearing basic segment" id="app-title">
                    <div class="ui grid">
                        <div class="twelve wide column">
                            <div class="ui huge header">
                                <i class="space shuttle icon"></i>
                                <div class="content">
                                    Trayson
                                </div>
                            </div>
                            <code>v0.0.1</code>
                        </div>
                        <div class="four wide column">
                            {(this.state.state > 0) ? (
                                <NetExporter state={this.state} />
                            ) : (null)}
                        </div>
                    </div>
                </div>
                {(this.state.state > 0) ? (
                    <div>
                        <NetVisualizer 
                            state = {this.state.state}
                            mlon = {this.state.mlon}
                            mlat = {this.state.mlat}
                            network = {this.state.network}
                            updateNetwork = {this.updateNetwork} 

                            // // force remount when taz creation is introduced
                            // key = {this.state.ntazs}
                            // // force remount once TAZs are set 
                            key = {this.state.state > 3}

                            tazList = {this.state.tazList} 
                            ntazs = {this.state.ntazs}
                            addNodeToSetInTAZlist = {this.addNodeToSetInTAZlist}
                            removeNodeFromSetInTAZlist = {this.removeNodeFromSetInTAZlist}
                        />
                        {(this.state.state === 1) ? (
                            <TrafficGetter 
                                eo = {this.state.eo}
                                no = {this.state.no}
                                es = {this.state.es}
                                ns = {this.state.ns}
                                network = {this.state.network}
                                handleAPIrequests = {this.handleAPIrequests}
                            />
                        ) : (null)}
                        {(this.state.state === 2) ? (
                            <TAZstarter
                                updateNumTAZs={this.updateNumTAZs}
                            />
                        ) : (null)}
                        {(this.state.state === 3) ? (
                            <TAZcreator
                                ntazs={this.state.ntazs}
                                network={this.state.network}
                                tazList={this.state.tazList}
                                setTAZs={this.setTAZs}
                            />
                        ) : (null)}
                        {((this.state.state === 4) || (this.state.state === 6)) ? (
                            <TripTableReader
                                state={this.state.state}
                                ntazs={this.state.ntazs}
                                handleTripTable={this.handleTripTable}

                                tripTable={this.state.tripTable}
                            />
                        ) : (null)}
                        {((this.state.state === 5) || (this.state.state === 7)) ? (
                            <TripAssigner
                                network={this.state.network}
                                ntazs={this.state.ntazs}
                                tripTable={this.state.incomingTripTable}
                                totalTrips={this.state.totalTrips}

                                scrapTripTable={this.scrapTripTable}
                                handleTripAssignment={this.handleTripAssignment}
                            />
                        ) : (null)}

                        {((this.state.state >= 3) && (this.state.state !== 5) && (this.state.state !== 7)) ? (
                            <div class="ui blue secondary segment">
                                <button class="ui red button" onClick={this.resetToAPInetwork}>Reset to Step 3: Travel Zone Definition</button>
                            </div>
                        ) : (null)}
                    </div>
                ) : (
                    <Upload 
                        handleOSMupload={this.handleOSMupload}
                        handleJSONupload={this.handleJSONupload} 
                    />
                )}
            </div>);
    }
}
