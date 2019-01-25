const webpack = require('webpack');

const config = {
    entry:  __dirname + '/src/js/index.js',
    output: {
        path: __dirname + '/static',
        // path: __dirname,
        filename: 'bundle.js',
    },
    resolve: {
        extensions: ['.js', '.jsx', '.css']
    },
    module: {
        rules: [
            {
                test: /\.jsx?/,
                exclude: /(node_modules)/,
                use: {
                  loader: 'babel-loader'
                }
            },
            {
              test: /\.css$/,
              use: [ 'style-loader', 'css-loader' ]
            },
            {
              test: /\.(png|jpg|gif)$/,
              use: [
                {
                  loader: 'file-loader',
                  options: {}
                }
              ]
            }
        ]
    }
};

module.exports = config;
