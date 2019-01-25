import React from "react";
import moment from "moment-timezone";

export default class TrafficGetter extends React.Component {
    constructor(props) {
        super(props);
        
        this.state = {
            retrieving: false,
            requests_failed: false,
            est_time: Math.round(2 * 0.4 * this.props.es / 60),
            est_cost: 2 * 0.01 * this.props.es,
            api_key: "",
            timezone: "America/Los_Angeles"
        };

        this.onKeyChange = this.onKeyChange.bind(this);
        this.onTimezoneChange = this.onTimezoneChange.bind(this);
        this.sendAPIrequests = this.sendAPIrequests.bind(this);
    }

    onKeyChange(e) {
        this.setState({
            api_key: e.target.value
        })
    }

    onTimezoneChange(e) {
        this.setState({
            timezone: e.target.value
        })
    }

    sendAPIrequests(e) {
        e.preventDefault();

        this.setState({
            retrieving: true
        })

        const request_day = moment.tz(moment(), this.state.timezone).startOf('day');

        const wed = 3;
        if (request_day.isoWeekday() < wed) {
            request_day.isoWeekday(wed);
        } else {
            request_day.add(1, 'weeks').isoWeekday(wed);
        }

        const rsp = fetch('/_get_traffic', {
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
                api_key: this.state.api_key,
                ff: request_day.clone().add(2, 'hours').unix(),
                am: request_day.clone().add(8, 'hours').unix(),
                nw: this.props.network
            }), // body data type must match "Content-Type" header
        }).then((response) => {
            if (!response.ok) {
                throw Error(response.statusText);
            }
            return response.json();
        }).then((nw) => {
            this.props.handleAPIrequests(nw);
        }).catch((error) => {
            console.log(error);
            this.setState({
                retrieving: false,
                requests_failed: true
            })
        });
    }

    render() {

        return (
            <div>
                <br />
                <div class="ui segments">
                <div class="ui four mini top attached steps">
                    <div class="completed step">
                        <i class="upload icon"></i>
                        <div class="content">
                            <div class="title">Step 1</div>
                            <div class="description">Network Extraction</div>
                        </div>
                    </div>
                    <div class="active step">
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
                    <div class="ui segment bottom attached">
                        <div class="ui warning message">
                            Simplified network from <code>{this.props.no}</code> to <code>{this.props.ns}</code> nodes and <code>{this.props.eo}</code> to <code>{this.props.es}</code> edges.
                        </div>
                        <div class="ui error message">
                            <i class="warning icon"></i>
                            It will take approximately <code>{this.state.est_time}</code> minutes to retrieve traffic information for a maximum cost of <code>${this.state.est_cost}</code>.
                        </div>
                        {(this.state.retrieving) ? (
                            <div class="ui success message">
                                <i class="thumbs up icon"></i>
                                Retrieving traffic information. This will take approximately <code>{Math.round(this.state.est_time)}</code> minutes. Do not navigate away from this page.
                            </div>
                        ) : (
                            <form onSubmit={this.sendAPIrequests} class="ui form">
                                {(this.state.requests_failed) ? (
                                    <div class="ui error message">
                                        <i class="warning icon"></i>
                                        Google was not happy with your API key, please check it!
                                    </div>
                                ) : (null)}
                                <p>Use a Google Directions API key to retrieve link travel times.</p>
                                <div class="field">
                                    <label>
                                        Google Directions API Key
                                    </label>
                                    <input type="text" value={this.state.api_key} onChange={this.onKeyChange} />
                                </div>
                                <div class="field">
                                    <label>
                                        Scenario Location Timezone
                                    </label>
                                    <select class="ui fluid dropdown"onChange={this.onTimezoneChange} value={this.state.timezone}>
                                        <option value="Pacific/Honolulu">(GMT-10:00) Hawaii</option>
                                        <option value="America/Anchorage">(GMT-09:00) Alaska</option>
                                        <option value="America/Los_Angeles">(GMT-08:00) Pacific Time</option>
                                        <option value="America/Phoenix">(GMT-07:00) Arizona</option>
                                        <option value="America/Denver">(GMT-07:00) Mountain Time</option>
                                        <option value="America/Chicago">(GMT-06:00) Central Time</option>
                                        <option value="America/New_York">(GMT-05:00) Eastern Time</option>
                                    </select>
                                </div>
                                <br />
                                <input class="ui button" type="submit" value="Submit" />
                            </form>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}
