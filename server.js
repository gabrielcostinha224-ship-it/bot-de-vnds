const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [3276799] });

let db = {
    painel: { nome: "Nome da Loja", banner: null },
    produtos: [],
    chavePix: "Não definida",
    msgPainelId: null
};

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('painel-vendas')
            .setDescription('Envia o painel da loja')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try { await rest.put(Routes.applicationCommands(clientId), { body: commands }); } catch (e) {}
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        if (!i.guild) return;

        let cargoDono = i.guild.roles.cache.find(r => r.name === 'Dono Sirius');
        let cargoVend = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoDono) cargoDono = await i.guild.roles.create({ name: 'Dono Sirius', color: '#ff0000' });
        if (!cargoVend) cargoVend = await i.guild.roles.create({ name: 'Vendedor Sirius', color: '#00ff6a' });

        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const embed = new EmbedBuilder()
                .setTitle(db.painel.nome)
                .setColor("#00ff6a")
                .setImage(db.painel.banner);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Ver Opções').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('configurar_loja').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            db.msgPainelId = msg.id;
        }

        // FORMULÁRIO NA ORDEM QUE VOCÊ PEDIU
        if (i.isButton() && i.customId === 'configurar_loja') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Sem permissão.", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_setup').setTitle('Configuração Sirius');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('loja_nome').setLabel('Nome da Loja').setStyle(TextInputStyle.Short).setValue(db.painel.nome)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_desc').setLabel('Descrever Produto').setStyle(TextInputStyle.Paragraph).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('loja_banner').setLabel('URL do Banner').setStyle(TextInputStyle.Short).setValue(db.painel.banner || "")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_nome').setLabel('Nome do Produto').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_valor').setLabel('Valor do Produto').setStyle(TextInputStyle.Short).setRequired(false)),
                // CHAVE PIX SERÁ SALVA JUNTO
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix').setLabel('Chave PIX').setStyle(TextInputStyle.Short).setValue(db.chavePix))
            );
            // Nota: Discord permite até 5 campos por Modal. Vou agrupar o PIX para caber tudo.
            // Para garantir que funcione, vou colocar o PIX no lugar do banner ou valor se estourar o limite de 5 linhas.
            // Como você pediu 6 campos, vou unificar Nome e Descrição no código abaixo para caber nas 5 linhas do Discord:
            
            const modalCorrigido = new ModalBuilder().setCustomId('m_setup').setTitle('Configuração Sirius');
            modalCorrigido.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('loja_nome').setLabel('1. Nome da Loja').setStyle(TextInputStyle.Short).setValue(db.painel.nome)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_desc').setLabel('2. Descrever Produto').setStyle(TextInputStyle.Paragraph)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('loja_banner').setLabel('3. URL do Banner').setStyle(TextInputStyle.Short).setValue(db.painel.banner || "")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_info').setLabel('4. Nome | Valor').setStyle(TextInputStyle.Short).setPlaceholder("Ex: Conta Full | R$ 50")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix').setLabel('5. Chave PIX').setStyle(TextInputStyle.Short).setValue(db.chavePix))
            );
            return await i.showModal(modalCorrigido);
        }

        if (i.isModalSubmit() && i.customId === 'm_setup') {
            db.painel.nome = i.fields.getTextInputValue('loja_nome');
            db.painel.banner = i.fields.getTextInputValue('loja_banner');
            db.chavePix = i.fields.getTextInputValue('pix');
            
            const pDesc = i.fields.getTextInputValue('p_desc');
            const pInfo = i.fields.getTextInputValue('p_info'); // Nome | Valor
            
            if (pInfo) {
                const [nome, valor] = pInfo.split('|').map(s => s.trim());
                db.produtos.push({ nome: nome || "Produto", valor: valor || "A combinar", desc: pDesc || "Sem descrição" });
            }

            const msg = await i.channel.messages.fetch(db.msgPainelId).catch(() => null);
            if (msg && msg.editable) {
                const up = new EmbedBuilder().setTitle(db.painel.nome).setImage(db.painel.banner).setColor("#00ff6a");
                await msg.edit({ embeds: [up] });
            }
            await i.reply({ content: "✅ Configurações salvas!", ephemeral: true });
        }

        if (i.isButton() && i.customId === 'ver_opcoes') {
            if (db.produtos.length === 0) return i.reply({ content: "❌ Sem produtos.", ephemeral: true });
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('comprar').setPlaceholder('Escolha um item da lista')
                    .addOptions(db.produtos.map((p, index) => ({ label: p.nome, description: `Valor: ${p.valor}`, value: index.toString() })))
            );
            await i.reply({ content: "Selecione o produto:", components: [menu], ephemeral: true });
        }

        if (i.isStringSelectMenu() && i.customId === 'comprar') {
            const prod = db.produtos[parseInt(i.values[0])];
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVend.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoDono.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle("Revisão do Pedido")
                .setDescription(`**Produto:** ${prod.nome}\n**Valor:** ${prod.valor}\n\n**Descrição:**\n${prod.desc}`)
                .setColor("#5865F2");

            const btns = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ir_pagar').setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Staff`, embeds: [embed], components: [btns] });
            await i.update({ content: `✅ Ticket: ${canal}`, components: [] });
        }

        if (i.isButton() && i.customId === 'ir_pagar') {
            const pixEmbed = new EmbedBuilder()
                .setTitle("Pagamento")
                .setDescription(`Chave PIX:\n\`${db.chavePix}\`\n\n*Envie o comprovante e aguarde.*`)
                .setColor("#00ff6a");
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('conf_p').setLabel('Confirmar Pagamento').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
            );
            await i.update({ embeds: [pixEmbed], components: [row] });
        }

        if (i.isButton() && i.customId === 'conf_p') {
            if (!i.member.roles.cache.has(cargoVend.id) && !i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Sem permissão.", ephemeral: true });
            await i.reply("✅ **Pago!** O vendedor vai te entregar agora.");
        }

        if (i.isButton() && i.customId === 'cancelar') await i.channel.delete().catch(() => {});
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
