import React from 'react';
import { scaleSequential } from 'd3-scale';
import { interpolateRainbow } from 'd3-scale-chromatic';

export default class TAZcreator extends React.Component {
    constructor(props) {
        super(props);

        this.uploadTAZs = this.uploadTAZs.bind(this);
    }

    uploadTAZs(e) {
        e.preventDefault();

        fetch('/_create_tazs', {
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
                tazList: this.props.tazList
            }), // body data type must match "Content-Type" header
        }).then((response) => {
                if (!response.ok) {
                    throw Error(response.statusText);
                }
                return response.json();
            }).then((rjson) => {
                this.props.setTAZs(rjson);
            }).catch((error) => {
                console.log(error);
                this.setState({
                    failed: true
                })
            });
    }
    
    render() {
        const ready = this.props.tazList.every(
            (e) => {
                return e.length > 0;
            }
        );

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
                <div class="ui bottom attached segment">
                    <p>Click on nodes and use the dropdown menu to associate them with your TAZs. Once every TAZ is associated with at least one node, you'll be able to upload these TAZs and proceed to trip assignment.</p>
                    <form onSubmit={this.uploadTAZs}>
                        <table class="ui celled table" cellPadding="1">
                            <colgroup>
                                <col style={{width: '10px'}} />
                                <col />
                                <col />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th> </th>
                                    <th>Zone</th>
                                    <th>Associated Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {this.props.tazList.map(
                                    (l, i) => {
                                        return (
                                            <tr key={String(i)+String(l)}>
                                                <td style={{
                                                    'backgroundColor': scaleSequential(interpolateRainbow)
                                                                        .domain([0, this.props.ntazs])
                                                                        (i)
                                                }}/>
                                                <td>{i+1}</td>
                                                <td>{l.join(', ')}</td>
                                            </tr>
                                        )
                                    }
                                )}
                            </tbody>
                        </table>
                        {(ready) ? (
                            <input class="ui button" type='submit' value='Create Zones' />
                        ) : ( null )}
                    </form>
                </div>
            </div>
        )
    }
}
