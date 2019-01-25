FROM python:3

# Transfer files
WORKDIR /app
ADD . /app

# Initial image setup
RUN apt-get update

# Install Node and NPM
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -
RUN apt-get install -y nodejs

# Install Julia
RUN wget "https://julialang-s3.julialang.org/bin/linux/x64/0.6/julia-0.6.4-linux-x86_64.tar.gz"
RUN tar -xvzf julia-0.6.4-linux-x86_64.tar.gz
RUN mv julia-9d11f62bcb/ julia-0.6

# Set up project dependencies
RUN npm install
RUN pip install -r requirements.txt
RUN ./julia-0.6/bin/julia -e 'Pkg.add.(["CSV", "DataFrames", "LightGraphs", "Optim", "BinDeps"])'

# Configure server
EXPOSE 5000
ENV FLASK_APP server.py

CMD ["flask", "run", "--host=0.0.0.0"]