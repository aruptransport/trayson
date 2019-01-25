import React from "react";

export default class NetExporter extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div class="ui basic right aligned segment" id="save-button">
                <a href={
                    "data:application/json;charset=utf-8," + JSON.stringify(this.props.state)
                } download="trayson_state.json" >
                    <button class="ui green labeled icon button">
                        <i class="save icon"></i>
                        Save
                    </button>
                </a>
            </div>
        );
    }
}
