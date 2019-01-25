import React from "react";

export default class Upload extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            osm_uploading: false,
            osm_upload_failed: false,
            json_uploading: false,
            json_upload_failed: false
        };
      
      this.handleOSMupclick = this.handleOSMupclick.bind(this);
      this.handleJSONupclick = this.handleJSONupclick.bind(this);
    }

    handleOSMupclick(e){
        this.setState({
            osm_uploading: true,
            osm_upload_failed: false
        });

        e.preventDefault(); 
        
        const fl = new FormData();
        fl.append('file', this.osmFile.files[0]);
        
        fetch('/_upload_osm', {
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
                this.props.handleOSMupload(rjson);
            }).catch((error) => {
                console.log(error);
                this.setState({
                    osm_uploading: false,
                    osm_upload_failed: true
                })
            });
    }

    handleJSONupclick(e){
        this.setState({
            json_uploading: true,
            json_upload_failed: false
        });

        e.preventDefault(); 

        const reader = new FileReader();
        reader.onload = (e => {this.props.handleJSONupload(JSON.parse(e.target.result))});
        reader.readAsText(this.jsonFile.files[0]);
    }


    render () {
        const failure_module = (
            <p color='red'>Upload failed. Please try again.</p>
        );

        const ing_module = (
            <div class="ui active inverted dimmer">
                <div class="ui active big text loader">Loading</div>
            </div>
        );

        return (
                <div class="ui segments"> 
                <div class="ui four mini top attached steps">
                    <div class="active step">
                        <i class="upload icon"></i>
                        <div class="content">
                            <div class="title">Step 1</div>
                            <div class="description">Network Extraction</div>
                        </div>
                    </div>
                    <div class="disabled step">
                        <i class="stopwatch icon"></i>
                        <div class="content">
                            <div class="title">Step 2</div>
                            <div class="description">Travel Time Retrieval</div>
                        </div>
                    </div>
                    <div class="disabled step">
                        <i class="map marker icon"></i>
                        <div class="content">
                            <div class="title">Step 3</div>
                            <div class="description">Travel Zone Definition</div>
                        </div>
                    </div>
                    <div class="disabled step">
                        <i class="bolt icon"></i>
                        <div class="content">
                            <div class="title">Step 4</div>
                            <div class="description">Traffic Assignment</div>
                        </div>
                    </div>
                </div>
                <div class="ui two column stackable center aligned grid bottom attached segment">
                    <div class="column">
                        <h3 class="ui center aligned icon header">
                            <i class="circular file icon"></i>
                            Start From Scratch
                        </h3>
                        <div>
                            {(this.state.osm_upload_failed) ? failure_module : null}
                            {(this.state.osm_uploading) ? (
                                ing_module
                            ) : (
                                <div>
                                    <form>
                                        <label htmlFor="browseOSMFile" class="ui left labeled button">
                                            <a class="ui basic right pointing label">
                                                .osm file
                                            </a>
                                            <div class="ui button">
                                                <i class="upload icon"></i>
                                                Upload
                                            </div>
                                        </label>
                                        <input 
                                            type="file" 
                                            id="browseOSMFile" 
                                            name="file" 
                                            style={{display: "none"}} 
                                            accept=".osm,.pbf" 
                                            ref={(ref)=>{ this.osmFile=ref; }}  
                                            onChange={this.handleOSMupclick}
                                        />
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                    <div class="ui vertical divider">or</div>
                    <div class="column">
                        <h3 class="ui center aligned icon header">
                            <i class="circular folder open icon"></i>
                            Open Saved Scenario
                        </h3>
                        <div>
                            {(this.state.json_upload_failed) ? failure_module : null}
                            {(this.state.json_uploading) ? ing_module : (
                                <div>
                                    <form>
                                        <label htmlFor="browseJsonFile" class="ui left labeled button">
                                            <a class="ui basic right pointing label">
                                                .json file
                                            </a>
                                            <div class="ui button">
                                                <i class="upload icon"></i>
                                                Upload
                                            </div>
                                        </label>
                                        <input 
                                            type="file" 
                                            id="browseJsonFile" 
                                            name="file" 
                                            style={{display: "none"}} 
                                            accept=".json" 
                                            ref={(ref)=>{ this.jsonFile=ref; }}  
                                            onChange={this.handleJSONupclick}
                                        />
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                </div>  
        </div>
        )
    }
}
