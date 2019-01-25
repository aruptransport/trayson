import React from "react";

export default class TripTableReader extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <table class="ui very basic collapsing celled table">
                <thead>
                    <tr>
                        <th />
                        {this.props.tripTable.map((e, i) => {return <th key={i}>{i+1}</th>})}
                    </tr>
                </thead>
                <tbody>
                    {this.props.tripTable.map((row, i) => {
                        return (
                            <tr key={i}>
                                <td><b>{i+1}</b></td>
                                {row.map((e, j) => {return <td key={String(i)+","+String(j)+":"+String(e)}>{e}</td>})}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        )
    }
}
