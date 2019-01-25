import React from "react";

import TripTableDisplay from './TripTableDisplay';

export default class TripAssigner extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            failed: false,
            ready: false,
            assigning: false,
            tripTable: null
        };
        
        this.doTripAssignment = this.doTripAssignment.bind(this);
    }

    doTripAssignment(e) {
        e.preventDefault();         
        
        this.setState({
            assigning: true
        });

        fetch('/_do_assignment', {
            method: "POST", // *GET, POST, PUT, DELETE, etc.
            // mode: "cors", // no-cors, cors, *same-origin
            // cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
            credentials: "same-origin", // include, same-origin, *omit
            headers: {
                "Accept": "application/json; charset=utf-8",
                "Content-Type": "application/json; charset=utf-8",
            },
            // redirect: "follow", // manual, *follow, error
            // referrer: "no-referrer", // no-referrer, *client
            body: JSON.stringify({
                nw: this.props.network,
                ntazs: this.props.ntazs,
                tt: this.props.tripTable,
                tot: this.props.totalTrips
            }), // body data type must match "Content-Type" header
        }).then((response) => {
                if (!response.ok) {
                    throw Error(response.statusText);
                }
                return response.json();
            }).then((rjson) => {
                this.props.handleTripAssignment(rjson);
            }).catch((error) => {
                console.log(error);
                this.setState({
                    assigning: false,
                    failed: true
                })
            });
    }

    render() {
        return (
            <div class="ui segments">
                <div class="ui four mini top attached steps">
                    <div class="completed step">
                        <i class="upload icon"></i>
                        <div class="content">
                            <div class="title">Step 1</div>
                            <div class="description">Network Extraction</div>
                        </div>
                    </div>
                    <div class="completed step">
                        <i class="stopwatch icon"></i>
                        <div class="content">
                            <div class="title">Step 2</div>
                            <div class="description">Travel Time Retrieval</div>
                        </div>
                    </div>
                    <div class="completed step">
                        <i class="map marker icon"></i>
                        <div class="content">
                            <div class="title">Step 3</div>
                            <div class="description">Travel Zone Definition</div>
                        </div>
                    </div>
                    <div class="active step">
                        <i class="bolt icon"></i>
                        <div class="content">
                            <div class="title">Step 4</div>
                            <div class="description">Traffic Assignment</div>
                        </div>
                    </div>
                </div>
                <div class="ui bottom attached segment">
                    <p>Uploaded trip table:</p>
                    <TripTableDisplay tripTable={this.props.tripTable} />
                    {(this.state.assigning) ? (
                        <div class="ui warning message">
                            Please wait, traffic assignment is running, this may take several minutes. Do not navigate away from this page.
                        </div>
                    ) : (
                        <div>
                            <p>Is this trip table correct?</p>
                            <button class="ui primary button" onClick={this.doTripAssignment}>Yes, run trip assignment</button>
                            <button class="ui button" onClick={this.props.scrapTripTable}>No, let me upload a new trip table</button>
                            {(this.state.failed) ? (
                                <div className="ui red message">
                                    <i className="warning icon"></i>
                                    Trip assignment failed. Try again or consider uploading a new trip table.
                                </div>
                            ) : (null)}
                        </div>
                    )}
                </div>
            </div>
        )
    }
}
