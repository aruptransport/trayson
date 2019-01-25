# modified from https://github.com/chkwon/TrafficAssignment.jl

using CSV, DataFrames, LightGraphs, Optim, BinDeps;

type TA_Data
    network_name::String

    number_of_zones::Int
    number_of_nodes::Int
#     first_thru_node::Int
    number_of_links::Int

    start_node::Array{Int,1}
    end_node::Array{Int,1}
    capacity::Array{Float64,1}
    link_length::Array{Float64,1}
    free_flow_time::Array{Float64,1}
    B::Array{Float64,1}
    power::Array{Float64,1}
    speed_limit::Array{Float64,1}
    toll::Array{Float64,1}
    link_type::Array{Int64,1}

    total_od_flow::Float64

    travel_demand::Array{Float64,2}
    od_pairs::Array{Tuple{Int64,Int64},1}

    toll_factor::Float64
    distance_factor::Float64

    best_objective::Float64

    travel_time::Array{Float64,1}
end

net_filename = ARGS[1]
net_metadata_filename = ARGS[2]

trip_metadata_filename = ARGS[3]
trip_filename = ARGS[4]

output_filename = ARGS[5]

function load_ta_network(net_name, net_metadata_filename, net_filename, trip_metadata_filename, trip_filename; 
    best_objective=-1.0, toll_factor=0.0, distance_factor=0.0, travel_time_initialization=nothing, fftime=:fftime)

    @assert ispath(net_metadata_filename)
    @assert ispath(net_filename)
    @assert ispath(trip_filename)

    ##################################################
    # Network Data
    ##################################################

    # read in metadata
    dfnm = CSV.read(net_metadata_filename; header=["Name", "Count"], allowmissing=:none)

    number_of_zones = dfnm[1,2]
    number_of_nodes = dfnm[2,2]
    #     first_thru_node = dfnm[3,2]
    number_of_links = dfnm[3,2]

    @assert number_of_links > 0

    # read in net
    dfn = CSV.read(net_filename; allowmissing=:none)

    start_node = dfn[:tail]
    end_node = dfn[:head]
    capacity = dfn[:capacity]
    link_length = dfn[:length]
    free_flow_time = dfn[fftime]
    B = dfn[:b]
    power = dfn[:power]
    speed_limit = dfn[:speedlimit]
    toll = dfn[:toll]
    link_type = dfn[:type]
    if travel_time_initialization != nothing
        travel_time = dfn[travel_time_initialization]
    else
        travel_time = zeros(number_of_links)
    end

    ##################################################
    # Trip Table
    ##################################################

    dftm = CSV.read(trip_metadata_filename; header=["Name", "Count"], allowmissing=:none)

    number_of_zones_trip = dftm[1,2]
    total_od_flow = dftm[2,2]

    @assert number_of_zones_trip == number_of_zones # Check if number_of_zone is same in both txt files
    @assert total_od_flow > 0

    travel_demand = zeros(number_of_zones, number_of_zones)
    od_pairs = Array{Tuple{Int64, Int64}}(0)

    dft = CSV.read(trip_filename; allowmissing=:none)

    ## old: columnar format
    # for row in eachrow(dft)
    #     push!(od_pairs, (row[1], row[2]))
    #     travel_demand[row[1], row[2]] = row[3]
    # end

    # new: od table format
    sort!(dft,1)
    delete!(dft,1)
    for i = 1:size(dft,2)
        for j = 1:size(dft,1)
            travel_demand[i,j] = dft[i,j]
        end
    end

    # Preparing data to return
    ta_data = TA_Data(
        net_name,
        number_of_zones,
        number_of_nodes,
    #         first_thru_node,
        number_of_links,
        start_node,
        end_node,
        capacity,
        link_length,
        free_flow_time,
        B,
        power,
        speed_limit,
        toll,
        link_type,
        total_od_flow,
        travel_demand,
        od_pairs,
        toll_factor,
        distance_factor,
        best_objective,
        travel_time
    )

    return ta_data

end # end of load_network function

dat = load_ta_network("moffet", net_metadata_filename, net_filename, trip_metadata_filename, trip_filename; 
    travel_time_initialization=:am, fftime=:base)

function TA_dijkstra_shortest_paths(graph, travel_time, origin, start_node, end_node)
    no_node = nv(graph)
    no_arc = ne(graph)

    distmx = Inf*ones(no_node, no_node)
    for i in 1:no_arc
        distmx[start_node[i], end_node[i]] = travel_time[i]
    end

    state = dijkstra_shortest_paths(graph, origin, distmx)
    return state
end

function create_graph(start_node, end_node, number_of_nodes)
    @assert Base.length(start_node)==Base.length(end_node)

    no_arc = Base.length(start_node)

    graph = DiGraph(number_of_nodes)
    for i=1:no_arc
        add_edge!(graph, start_node[i], end_node[i])
    end
    return graph
end

function get_vector(state, origin, destination, link_dic)
    current = destination
    parent = -1
    x = zeros(Int, maximum(link_dic))
#     x = zeros(Int, Base.length(link_dic))

    while parent != origin && origin != destination && current != 0
        parent = state.parents[current]

        # println("origin=$origin, destination=$destination, parent=$parent, current=$current")

        if parent != 0
            link_idx = link_dic[parent,current]
            if link_idx != 0
                x[link_idx] = 1
            end
#             link_idx = get(link_dic, (parent,current), 0)
#             if link_idx != 0
#                 x[link_idx] = 1
#             end
        end

        current = parent
    end

    return x
end

function add_demand_vector!(x, demand, state, origin, destination, link_dic)
    current = destination
    parent = -1

    while parent != origin && origin != destination && current != 0
        parent = state.parents[current]

        if parent != 0
            link_idx = link_dic[parent,current]
            if link_idx != 0
                x[link_idx] += demand
            end
#           link_idx = get(link_dic, (parent,current), 0)
#           if link_idx != 0
#               x[link_idx] += demand
#           end
        end

        current = parent
    end
end

# Frank-Wolfe Methods
# CFW and BFW in Mitradijieva and Lindberg (2013)

# required packages: Graphs, Optim

# include("misc.jl")


function ta_frank_wolfe(ta_data; method=:bfw, min_iter_no=5, max_iter_no=2000, step=:exact, log=:off, tol=1e-3)
    # in the original algorithm, x/xk represented distribution of flow
    # in this edited version, it represents the distribution of additional flow from our OD trips on top of inferred existing flows
    
    setup_time = time()

    if log==:on
        println("-------------------------------------")
        println("Network Name: $(ta_data.network_name)")
        println("Method: $method")
        println("Line Search Step: $step")
        println("Maximum Interation Number: $max_iter_no")
        println("Tolerance for AEC: $tol")
        println("Number of processors: ", nprocs())
    end


    # unpacking data from ta_data
    network_name = ta_data.network_name

    number_of_zones = ta_data.number_of_zones
    number_of_nodes = ta_data.number_of_nodes
#     first_thru_node = ta_data.first_thru_node
    number_of_links = ta_data.number_of_links

    start_node = ta_data.start_node
    end_node = ta_data.end_node
    capacity = ta_data.capacity
    link_length = ta_data.link_length

    free_flow_time = ta_data.free_flow_time
    B = ta_data.B
    power = ta_data.power
    speed_limit = ta_data.speed_limit
    toll = ta_data.toll
    link_type = ta_data.link_type
    number_of_zones = ta_data.number_of_zones
    total_od_flow = ta_data.total_od_flow
    travel_demand = ta_data.travel_demand
    od_pairs = ta_data.od_pairs

    toll_factor = ta_data.toll_factor
    distance_factor = ta_data.distance_factor

    best_objective = ta_data.best_objective

    travel_time = ta_data.travel_time


    # preparing a graph
    graph = create_graph(start_node, end_node, number_of_nodes)
    link_dic = sparse(start_node, end_node, collect(1:number_of_links))
#     link_dic = collect(zip(start_node, end_node))
#     link_dic = Dict{Tuple{Int64,Int64}, Int64}(links[i] => i for i=1:number_of_links)

    # calculate flow from seeded times
    if travel_time != zeros(number_of_links)
        fixed_flow = similar(travel_time)
        for i=1:length(fixed_flow)
            if (free_flow_time[i] > travel_time[i]) || (travel_time[i] == 0) || (free_flow_time[i] == 0)
                fixed_flow[i] = 0
            else
#                 println(travel_time[i], free_flow_time[i])
                fixed_flow[i] = ((travel_time[i]/free_flow_time[i] - 1)/B[i])^(1/power[i]) * capacity[i]
            end
        end
    end
#     print(fixed_flow)
#     return
    
    setup_time = time() - setup_time

    if log==:on
        println("Setup time = $setup_time seconds")
    end

    function BPR(x)
        # travel_time = free_flow_time .* ( 1.0 + B .* (x./capacity).^power )
        # generalized_cost = travel_time + toll_factor *toll + distance_factor * link_length
        # return generalized_cost

        bpr = similar(x)
        for i=1:length(bpr)
            bpr[i] = free_flow_time[i] * ( 1.0 + B[i] * ((x[i] + fixed_flow[i])/capacity[i])^power[i] )
            bpr[i] += toll_factor * toll[i] + distance_factor * link_length[i]
        end
        return bpr
    end

    function objective(x)
        # value = free_flow_time .* ( x + B.* ( x.^(power+1)) ./ (capacity.^power) ./ (power+1))
        # return sum(value)

        sum = 0.0
        for i=1:length(x)
            sum += free_flow_time[i] * ( (x[i] + fixed_flow[i]) + B[i]* ( (x[i] + fixed_flow[i])^(power[i]+1)) / (capacity[i]^power[i]) / (power[i]+1))
            sum += toll_factor *toll[i] + distance_factor * link_length[i]
        end
        return sum
    end

    function gradient(x)
        return BPR(x)
    end

    function hessian(x)
        no_arc = Base.length(start_node)

        h = zeros(no_arc,no_arc)
        h_diag = hessian_diag(x)

        for i=1:no_arc
            h[i,i] = h_diag[i]
        end

        return h

        #Link travel time = free flow time * ( 1 + B * (flow/capacity)^Power ).
    end

    function hessian_diag(x)
        h_diag = Array{Float64}(size(x))
        for i=1:length(x)
            if power[i] >= 1.0
                h_diag[i] = free_flow_time[i] * B[i] * power[i] * ((x[i] + fixed_flow[i])^(power[i]-1)) / (capacity[i]^power[i])
            else
                h_diag[i] = 0 # Some cases, power is zero.
            end
        end
        # h_diag = free_flow_time .* B .* power .* (x.^(power-1)) ./ (capacity.^power)

        return h_diag
        #Link travel time = free flow time * ( 1 + B * (flow/capacity)^Power ).
    end


    function all_or_nothing_single(travel_time)
        state = LightGraphs.DijkstraState{Float64}
        x = zeros(size(start_node))

        for r=1:size(travel_demand)[1]
            # for each origin node r, find shortest paths to all destination nodes
            state = TA_dijkstra_shortest_paths(graph, travel_time, r, start_node, end_node)

            for s=1:size(travel_demand)[2]
                # for each destination node s, find the shortest-path vector
                # load travel demand
                # x = x + travel_demand[r,s] * get_vector(state, r, s, link_dic)
                add_demand_vector!(x, travel_demand[r,s], state, r, s, link_dic)
            end
        end
        return x
    end


    # parallel computing version
    function all_or_nothing_parallel(travel_time)
        state = LightGraphs.DijkstraState{Float64}
        vv = zeros(size(start_node))
        x = zeros(size(start_node))

        x = x + @parallel (+) for r=1:size(travel_demand)[1]
            # for each origin node r, find shortest paths to all destination nodes
            # if there is any travel demand starting from node r.
            vv = zeros(size(start_node))

            if sum(travel_demand, 2)[r] > 0.0
                state = TA_dijkstra_shortest_paths(graph, travel_time, r, start_node, end_node)

                for s=1:size(travel_demand)[2]
                    # for each destination node s, find the shortest-path vector
                    # v = get_vector(state, r, s, start_node, end_node)

                    if travel_demand[r,s] > 0.0
                        # load travel demand
                        # vv = vv + travel_demand[r,s] * get_vector(state, r, s, link_dic)
                        add_demand_vector!(vv, travel_demand[r,s], state, r, s, link_dic)
                    end
                end

            end

            vv
        end

        return x
    end


    function all_or_nothing(travel_time)
        if nprocs() > 1 # if multiple CPU processes are available
            all_or_nothing_parallel(travel_time)
        else
            all_or_nothing_single(travel_time)
            # when nprocs()==1, using @parallel just adds unnecessary setup time. I guess.
        end
    end










    iteration_time = time()


    # Finding a starting feasible solution
    if travel_time == zeros(number_of_links)
        travel_time = BPR(zeros(number_of_links))
    end
    x0 = all_or_nothing(travel_time)

    # Initializing variables
    xk = x0
    tauk = 0.0
    yk_FW = x0
    sk_CFW = yk_FW
    Hk_diag = Array{Float64,1}

    dk_FW = Array{Float64,1}
    dk_bar = Array{Float64,1}
    dk_CFW = Array{Float64,1}
    dk = Array{Float64,1}

    alphak = 0.0
    Nk = 0.0
    Dk = 0.0

    tauk = 0.0
    is_first_iteration = false
    is_second_iteration = false

    sk_BFW = yk_FW
    sk_BFW_old = yk_FW

    dk_bbar = Array{Float64,1}
    muk = Array{Float64,1}
    nuk = Array{Float64,1}
    beta0 = 0.0
    beta1 = 0.0
    beta2 = 0.0

    best_objective = objective(xk)
#     println(best_objective)

    # function fk(tau)
    #     value = objective(xk+tau*dk)
    #     return value
    # end
    #
    # function lower_bound_k(x, xk)
    #     value = objective(xk) + dot( BPR(xk), ( x - xk) )
    # end


    for k=1:max_iter_no
        # Finding yk
        travel_time = BPR(xk)
        yk_FW = all_or_nothing(travel_time)


        # Basic Frank-Wolfe Direction
        dk_FW = yk_FW - xk
        Hk_diag = hessian_diag(xk) # Hk_diag is a diagonal vector of matrix Hk

        # Finding a feasible direction
        if method == :fw # Original Frank-Wolfe
            dk = dk_FW
        elseif method == :cfw # Conjugate Direction F-W
            if k==1 || tauk > 0.999999 # If tauk=1, then start the process all over again.
                sk_CFW = yk_FW
                dk_CFW = sk_CFW - xk
            else
                dk_bar = sk_CFW - xk # sk_CFW from the previous iteration k-1

                Nk = dot( dk_bar, Hk_diag .* dk_FW )
                Dk = dot( dk_bar, Hk_diag .* (dk_FW - dk_bar) )

                delta = 0.0001 # What value should I use?
                # alphak = 0
                if Dk !=0 && 0 <= Nk/Dk <= 1-delta
                    alphak = Nk/Dk
                elseif Dk !=0 && Nk/Dk > 1-delta
                    alphak = 1-delta
                else
                    alphak = 0
                end

                # Generating new sk_CFW and dk_CFW
                sk_CFW = alphak * sk_CFW + (1-alphak) * yk_FW
                dk_CFW = sk_CFW - xk
            end

            # Feasible Direction to Use for CFW
            dk = dk_CFW
        elseif method == :bfw # Bi-Conjugate Direction F-W

            if tauk > 0.999999
                is_first_iteration = true
                is_second_iteration = true
            end

            if k==1 || is_first_iteration       # First Iteration is like FW
                # println("here")
                sk_BFW_old = yk_FW
                dk_BFW = dk_FW
                is_first_iteration = false
            elseif k==2 || is_second_iteration  # Second Iteration is like CFW
                # println("there")
                dk_bar = sk_BFW_old - xk # sk_BFW_old from the previous iteration 1

                Nk = dot( dk_bar, Hk_diag .* dk_FW )
                Dk = dot( dk_bar, Hk_diag .* (dk_FW - dk_bar) )

                delta = 0.0001 # What value should I use?
                # alphak = 0
                if Dk !=0 && 0 <= Nk/Dk <= 1-delta
                    alphak = Nk/Dk
                elseif Dk !=0 && Nk/Dk > 1-delta
                    alphak = 1-delta
                else
                    alphak = 0
                end

                # Generating new sk_BFW and dk_BFW
                sk_BFW = alphak * sk_BFW_old + (1-alphak) * yk_FW
                dk_BFW = sk_BFW - xk

                is_second_iteration = false
            else
                # println("over there $tauk")
                # sk_BFW, tauk is from iteration k-1
                # sk_BFW_old is from iteration k-2

                dk_bar  = sk_BFW - xk
                dk_bbar = tauk * sk_BFW - xk + (1-tauk) * sk_BFW_old

                muk = - dot( dk_bbar, Hk_diag .* dk_FW ) / dot( dk_bbar, Hk_diag .* (sk_BFW_old - sk_BFW) )
                nuk = - dot( dk_bar, Hk_diag .* dk_FW ) / dot( dk_bar, Hk_diag .* dk_bar) + muk*tauk/(1-tauk)

                muk = max(0, muk)
                nuk = max(0, nuk)

                # println(sk_BFW_old-sk_BFW)

                beta0 = 1 / ( 1 + muk + nuk )
                beta1 = nuk * beta0
                beta2 = muk * beta0

                # dk_BFW = beta0 * dk_FW + beta1 * (sk_BFW - xk) + beta2 * (sk_BFW_old - xk)

                sk_BFW_new = beta0 * yk_FW + beta1 * sk_BFW + beta2 * sk_BFW_old
                dk_BFW = sk_BFW_new - xk

                sk_BFW_old = sk_BFW
                sk_BFW = sk_BFW_new

            end

            # Feasible Direction to Use for BFW
            dk = dk_BFW
        else
            error("The type of Frank-Wolfe method is specified incorrectly. Use :fw, :cfw, or :bfw.")
        end
        # dk is now identified.


        if step==:exact
            # Line Search from xk in the direction dk
            optk = optimize(tau -> objective(xk+tau*dk), 0.0, 1.0, GoldenSection())
            tauk = optk.minimizer
        elseif step==:newton
            # Newton step
            tauk = - dot( gradient(xk), dk ) / dot( dk, Hk_diag.*dk )
            tauk = max(0, min(1, tauk))
        end


        obj = objective(xk)
        
        # Average Excess Cost
        average_excess_cost = ( dot(xk, travel_time) - dot(yk_FW, travel_time) ) / sum(travel_demand)
        if log==:on
            # println("k=$k,\ttauk=$tauk,\tobjective=$(objective(xk)),\taec=$average_excess_cost")
            @printf("k=%4d, tauk=%15.10f, objective=%15f, aec=%15.10f\n", k, tauk, obj, average_excess_cost)
        end

#         rel_gap = ( objective(xk) - best_objective ) / best_objective
#         rel_gap = ( best_objective - obj )
        rel_gap = abs( objective(xk) - best_objective ) / best_objective

        # Convergence Test
#         if average_excess_cost < tol
        if k > min_iter_no && rel_gap < tol 
#         if obj-prior_obj < tol
            if log==:on
                println("Exited before reaching max_iter_no")
            end
            break
        end
        
        best_objective = min(best_objective, obj)

        # Update x
        new_x = xk + tauk*dk
        xk = new_x

        @assert minimum(xk) >= 0
    end

    if log==:on
        println(best_objective)
    end

    iteration_time = time() - iteration_time

    if log==:on
        println("Iteration time = $iteration_time seconds")
    end

    return xk, travel_time, objective(xk), fixed_flow

end

xk, travel_time, obj, fixed_flow = ta_frank_wolfe(dat; log=:off, method=:cfw, tol=1e-9, max_iter_no=2000, min_iter_no=5) # :bfw results in xk<0 error

df = DataFrame(tail=dat.start_node, head=dat.end_node, travel_time=travel_time, xk=xk, fixed_flow=fixed_flow)
CSV.write(output_filename, df)
