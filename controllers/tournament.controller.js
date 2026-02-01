const Tournament = require('../models/Tournament');
const TournamentTeam = require('../models/TournamentTeam');
const User = require('../models/User');
const Payment = require('../models/Payment');

// @desc    Get all tournaments
// @route   GET /api/tournaments
// @access  Public
exports.getAllTournaments = async (req, res, next) => {
  try {
    const { status, type, featured, limit = 10, page = 1 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (type) query.tournamentType = type;
    if (featured) query.isFeatured = featured === 'true';
    
    const tournaments = await Tournament.find(query)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await Tournament.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: tournaments.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: tournaments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single tournament
// @route   GET /api/tournaments/:id
// @access  Public
exports.getTournament = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('participants.userId', 'name inGameName bgmiId')
      .populate('winners.userId', 'name inGameName')
      .populate('winners.teamId', 'teamName members');
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    // Increment view count
    tournament.viewCount += 1;
    await tournament.save();
    
    res.status(200).json({
      success: true,
      data: tournament
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register for tournament (Solo/Duo)
// @route   POST /api/tournaments/:id/register
// @access  Private
exports.registerForTournament = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    // Check if tournament is squad type
    if (tournament.tournamentType === 'squad') {
      return res.status(400).json({
        success: false,
        message: 'Please use squad registration endpoint'
      });
    }
    
    // FIXED: Better registration checks
    const now = new Date();
    const regStart = new Date(tournament.registrationStartDate);
    const regEnd = new Date(tournament.registrationEndDate);
    
    // Check if registration hasn't started
    if (now < regStart) {
      return res.status(400).json({
        success: false,
        message: 'Registration has not started yet'
      });
    }
    
    // Check if registration has ended
    if (now > regEnd) {
      return res.status(400).json({
        success: false,
        message: 'Registration period has ended'
      });
    }
    
    // Check if tournament is full
    if (tournament.currentParticipants >= tournament.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Tournament is full'
      });
    }
    
    // Check if already registered
    const alreadyRegistered = tournament.participants.some(
      p => p.userId.toString() === req.user.id
    );
    
    if (alreadyRegistered) {
      return res.status(400).json({
        success: false,
        message: 'Already registered for this tournament'
      });
    }
    
    // Check profile completion
    const user = await User.findById(req.user.id);
    if (!user.bgmiId || !user.inGameName) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile with BGMI ID and In-Game Name'
      });
    }
    
    // For duo, check partner info
    let partnerInfo = null;
    if (tournament.tournamentType === 'duo') {
      const { partnerBgmiId, partnerInGameName } = req.body;
      if (!partnerBgmiId || !partnerInGameName) {
        return res.status(400).json({
          success: false,
          message: 'Please provide partner BGMI ID and In-Game Name'
        });
      }
      partnerInfo = { bgmiId: partnerBgmiId, inGameName: partnerInGameName };
    }
    
    // Create payment if not free
    let payment = null;
    if (!tournament.isFree) {
      payment = await Payment.create({
        paymentType: 'individual',
        userId: req.user.id,
        tournamentId: tournament._id,
        amount: tournament.serviceFee,
        currency: 'INR',
        paymentStatus: 'pending',
        paymentGateway: 'razorpay',
        customerDetails: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          bgmiId: user.bgmiId,
          inGameName: user.inGameName
        }
      });
    }
    
    // Add participant
    tournament.participants.push({
      userId: req.user.id,
      bgmiId: user.bgmiId,
      inGameName: user.inGameName,
      paymentStatus: tournament.isFree ? 'paid' : 'pending',
      paymentId: payment?._id,
      partnerInfo
    });
    
    tournament.currentParticipants += 1;
    tournament.registrationCount += 1;
    await tournament.save();
    
    res.status(200).json({
      success: true,
      message: 'Registered successfully',
      payment: payment ? {
        id: payment._id,
        amount: payment.amount,
        invoiceId: payment.invoiceId
      } : null,
      data: tournament
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register squad for tournament
// @route   POST /api/tournaments/:id/register-squad
// @access  Private
exports.registerSquad = async (req, res, next) => {
  try {
    const { teamName, members } = req.body; // members = [{bgmiId, inGameName}, ...]
    
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    if (tournament.tournamentType !== 'squad') {
      return res.status(400).json({
        success: false,
        message: 'This is not a squad tournament'
      });
    }
    
    // FIXED: Better registration checks
    const now = new Date();
    const regStart = new Date(tournament.registrationStartDate);
    const regEnd = new Date(tournament.registrationEndDate);
    
    // Check if registration hasn't started
    if (now < regStart) {
      return res.status(400).json({
        success: false,
        message: 'Registration has not started yet'
      });
    }
    
    // Check if registration has ended
    if (now > regEnd) {
      return res.status(400).json({
        success: false,
        message: 'Registration period has ended'
      });
    }
    
    // Check if tournament is full
    if (tournament.currentParticipants >= tournament.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Tournament is full'
      });
    }
    
    // Get user details
    const user = await User.findById(req.user.id);
    if (!user.bgmiId || !user.inGameName) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile with BGMI ID and In-Game Name'
      });
    }
    
    // Validate team size
    const totalMembers = members.length + 1; // +1 for captain
    if (totalMembers !== tournament.teamSize) {
      return res.status(400).json({
        success: false,
        message: `Squad must have exactly ${tournament.teamSize} members`
      });
    }
    
    // Validate all BGMI IDs
    const allBgmiIds = [user.bgmiId, ...members.map(m => m.bgmiId)];
    const uniqueBgmiIds = new Set(allBgmiIds);
    
    if (uniqueBgmiIds.size !== allBgmiIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate BGMI IDs not allowed in same squad'
      });
    }
    
    // Check if user already registered
    const existingTeam = await TournamentTeam.findOne({
      tournamentId: tournament._id,
      'captain.userId': req.user.id
    });
    
    if (existingTeam) {
      return res.status(400).json({
        success: false,
        message: 'You have already registered a squad for this tournament'
      });
    }
    
    // Create team
    const team = await TournamentTeam.create({
      tournamentId: tournament._id,
      teamName: teamName || `${user.name}'s Squad`,
      captain: {
        userId: req.user.id,
        bgmiId: user.bgmiId,
        inGameName: user.inGameName
      },
      members: members.map(m => ({
        bgmiId: m.bgmiId,
        inGameName: m.inGameName,
        status: 'confirmed'
      })),
      registrationStatus: 'registered'
    });
    
    // Create payment if not free
    let payment = null;
    if (!tournament.isFree) {
      payment = await Payment.create({
        paymentType: 'team',
        userId: req.user.id,
        tournamentId: tournament._id,
        teamId: team._id,
        payingCaptainId: req.user.id,
        coveredUsers: [
          { userId: req.user.id, bgmiId: user.bgmiId, inGameName: user.inGameName, isCaptain: true },
          ...members.map(m => ({ bgmiId: m.bgmiId, inGameName: m.inGameName, isCaptain: false }))
        ],
        amount: tournament.serviceFee,
        currency: 'INR',
        paymentStatus: 'pending',
        paymentGateway: 'razorpay',
        customerDetails: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          bgmiId: user.bgmiId,
          inGameName: user.inGameName
        }
      });
      
      team.paymentId = payment._id;
      team.paymentStatus = 'pending';
      await team.save();
    } else {
      team.paymentStatus = 'paid';
      await team.save();
    }
    
    // Update tournament
    tournament.currentParticipants += 1;
    tournament.registrationCount += 1;
    await tournament.save();
    
    res.status(200).json({
      success: true,
      message: 'Squad registered successfully',
      payment: payment ? {
        id: payment._id,
        amount: payment.amount,
        invoiceId: payment.invoiceId
      } : null,
      data: team
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get tournament leaderboard
// @route   GET /api/tournaments/:id/leaderboard
// @access  Public
exports.getLeaderboard = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    let leaderboard;
    
    if (tournament.tournamentType === 'squad') {
      // Get squad leaderboard
      leaderboard = await TournamentTeam.find({
        tournamentId: tournament._id,
        registrationStatus: { $in: ['registered', 'verified'] }
      })
        .populate('captain.userId', 'name inGameName')
        .sort({ totalPoints: -1, totalKills: -1 })
        .select('teamName captain members totalKills totalPoints placement');
    } else {
      // Get solo/duo leaderboard
      leaderboard = tournament.participants
        .filter(p => p.paymentStatus === 'paid')
        .sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          return b.totalKills - a.totalKills;
        })
        .map((p, index) => ({
          rank: index + 1,
          userId: p.userId,
          inGameName: p.inGameName,
          bgmiId: p.bgmiId,
          totalKills: p.totalKills,
          totalPoints: p.totalPoints
        }));
    }
    
    res.status(200).json({
      success: true,
      tournamentType: tournament.tournamentType,
      data: leaderboard
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get tournament participants count
// @route   GET /api/tournaments/:id/participants
// @access  Public
exports.getTournamentParticipants = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    let individualParticipants = 0;
    let teamsCount = 0;
    
    if (tournament.tournamentType === 'squad') {
      // Count teams
      teamsCount = await TournamentTeam.countDocuments({
        tournamentId: tournament._id,
        registrationStatus: { $in: ['registered', 'verified'] }
      });
      
      // Each team has 4 members
      individualParticipants = teamsCount * 4;
    } else {
      // Count individual participants
      individualParticipants = tournament.participants.filter(p => p.paymentStatus === 'paid').length;
    }
    
    res.status(200).json({
      success: true,
      data: {
        totalParticipants: tournament.currentParticipants,
        individualParticipants,
        teamsCount,
        tournamentType: tournament.tournamentType
      }
    });
  } catch (error) {
    next(error);
  }
};

