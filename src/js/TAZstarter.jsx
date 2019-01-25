import React from "react";

export default class TripTableReader extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            numTAZ: 0
        };
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
                    <div class="active step">
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
                <div class="ui segment bottom attached">
                    <form class="ui form" onSubmit={() => {this.props.updateNumTAZs(this.state.numTAZ)}}>
                        <div class="field">
                            <label>
                                Number of Zones
                            </label>
                        <input type="number" step="1" min="2" 
                            value={
                                (this.state.numTAZ === 0) ? ("") : this.state.numTAZ
                            } 
                            onChange={
                                (e) => {this.setState({numTAZ : Number(e.target.value)})}
                        }/>
                        </div>
                        <input class="ui button" type="submit" value="Submit"/>
                    </form>
                </div>
            </div>
            
        )
    }
}
