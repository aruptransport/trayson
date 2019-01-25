import React from "react";

import TripTableDisplay from './TripTableDisplay';

export default class TripTableReader extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            failed: false,
            tableTAZs: -1
        };
        
        this.uploadTripTable = this.uploadTripTable.bind(this);
    }

    uploadTripTable(e) {
        e.preventDefault(); 
        
        const fl = new FormData();
        fl.append('file', this.file.files[0]);
        
        const rsp = fetch('/_upload_trip_table', {
            method: "POST", // *GET, POST, PUT, DELETE, etc.
            // mode: "cors", // no-cors, cors, *same-origin
            // cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
            credentials: "same-origin", // include, same-origin, *omit
            // headers: {
            //     "Content-Type": "application/json; charset=utf-8",
            //     // "Content-Type": "application/x-www-form-urlencoded",
            // },
            // redirect: "follow", // manual, *follow, error
            // referrer: "no-referrer", // no-referrer, *client
            body: fl, // body data type must match "Content-Type" header
            // body: this.osmFile
        }).then((response) => {
                if (!response.ok) {
                    throw Error(response.statusText);
                }
                return response.json();
            }).then((rjson) => {
                if (rjson.ntazs === this.props.ntazs) {
                    this.props.handleTripTable(rjson);
                } else {
                    this.setState({
                        tableTAZs: rjson.ntazs
                    })
                }
            }).catch((error) => {
                console.log(error);
                this.setState({
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
                    Upload a trip table CSV.
                    <ul>
                        <li>Trip table must be square (same number of rows and columns).</li>
                        <li>Row numbers represent origin zone, column numbers represent destination zone.</li>
                        <li>Do not include any row or column numbers. The table should only contain volumes.</li>
                    </ul>
                    <form class="ui form">
                        {(this.props.state === 6) ? (
                            <TripTableDisplay tripTable={this.props.tripTable} />
                        ) : (null)}
                        {(this.state.failed) ? (
                            <div className="ui red message">
                                <i className="warning icon"></i>
                                The trip table does not conform to requirements, please try again!
                            </div>
                        ) : null}
                        {(this.state.tableTAZs > -1) ? (
                            <div className="ui red message">
                                <i className="warning icon"></i>
                                The number of zones in the trip table <code>{this.state.tableTAZs}</code> does not match the allocated zones, please try again!
                            </div>
                         ) : null}
                        <label htmlFor="browseTripsTable" class="ui left labeled button">
                            <a class="ui basic right pointing label">
                                .csv file
                            </a>
                            <div class="ui button">
                                <i class="upload icon"></i>
                                    Upload
                                </div>
                            </label>
                        <input 
                            type="file" 
                            id="browseTripsTable"
                            name="file" 
                            style={{display: "none"}} 
                            accept=".csv" 
                            ref={(ref)=>{ this.file=ref; }} 
                            onChange={this.uploadTripTable}
                        />
                    </form>
                </div>
            </div>
        )
    }
}
